<?php

namespace App\Services;

use CodeIgniter\Database\BaseConnection;
use CodeIgniter\Database\Exceptions\DatabaseException;
use RuntimeException;

class SalesTransactionService
{
    private BaseConnection $db;
    private BudgetMovementService $budgetSvc;
    private NumberSeriesService $numberSeriesSvc;
    private PromotionValueSourceService $valueSourceSvc;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
        $this->budgetSvc = new BudgetMovementService();
        $this->numberSeriesSvc = new NumberSeriesService();
        $this->valueSourceSvc = new PromotionValueSourceService();
    }

    public function create(array $data): array
    {
        $projectId = (int) ($data['project_id'] ?? 0);
        $unitId = (int) ($data['unit_id'] ?? 0);
        $saleDate = $data['sale_date'] ?? date('Y-m-d');
        $contractPrice = isset($data['contract_price']) && $data['contract_price'] !== '' ? (float) $data['contract_price'] : null;
        $items = $data['items'] ?? [];
        $createdBy = (int) ($data['created_by'] ?? 0);

        if ($projectId <= 0) throw new RuntimeException('กรุณาระบุ project_id');
        if ($unitId <= 0) throw new RuntimeException('กรุณาระบุ unit_id');
        if ($contractPrice === null || $contractPrice <= 0) {
            throw new RuntimeException('กรุณาระบุราคาหน้าสัญญา');
        }

        $addOns = $this->normalizeAddOns($data);

        $this->db->transBegin();

        try {
            $unit = $this->validateUnit($projectId, $unitId);
            $items = $this->validateItems($projectId, $unitId, $items, $saleDate);
            $this->validateBudget($projectId, $unitId, $items);

            $saleNo = $this->generateSaleNo($projectId);
            $calculations = $this->calculate($items, $unit, $addOns);

            $transactionId = $this->insertTransaction([
                'sale_no' => $saleNo,
                'project_id' => $projectId,
                'unit_id' => $unitId,
                'base_price' => $unit['base_price'],
                'unit_cost' => $unit['unit_cost'],
                'net_price' => $calculations['net_price'],
                'total_discount' => $calculations['total_discount'],
                'total_promo_cost' => $calculations['total_promo_cost'],
                'total_expense_support' => $calculations['total_expense_support'],
                'total_promo_burden' => $calculations['total_promo_burden'],
                'total_cost' => $calculations['total_cost'],
                'profit' => $calculations['profit'],
                'sale_date' => $saleDate,
                'contract_price' => $contractPrice,
                'loan_markup_amount' => $addOns['loan_markup_amount'],
                'additional_expense_amount' => $addOns['additional_expense_amount'],
                'additional_expense_mode' => $addOns['additional_expense_mode'],
                'created_by' => $createdBy,
            ]);

            $insertedItems = $this->insertItems($transactionId, $items, $projectId, $createdBy);
            $movements = $this->createBudgetMovements($projectId, $unitId, $items, $createdBy, $transactionId, $addOns);
            $this->updateUnitStatus($unitId, $saleDate);

            $this->db->transCommit();

            return [
                'sales_transaction' => $this->db->table('sales_transactions')
                    ->where('id', $transactionId)->get()->getRowArray(),
                'items' => $insertedItems,
                'budget_movements' => $movements,
            ];
        } catch (RuntimeException $e) {
            $this->db->transRollback();
            throw $e;
        } catch (DatabaseException $e) {
            $this->db->transRollback();
            throw new RuntimeException('เกิดข้อผิดพลาดในการบันทึก: ' . $e->getMessage());
        }
    }

    public function update(int $id, array $data): array
    {
        $transaction = $this->db->table('sales_transactions')
            ->where('id', $id)->get()->getRowArray();

        if (!$transaction) {
            throw new RuntimeException('ไม่พบรายการขาย');
        }

        $projectId = (int) ($data['project_id'] ?? $transaction['project_id']);
        $unitId = (int) ($data['unit_id'] ?? $transaction['unit_id']);
        $saleDate = $data['sale_date'] ?? $transaction['sale_date'];
        $contractPrice = array_key_exists('contract_price', $data) && $data['contract_price'] !== '' && $data['contract_price'] !== null
            ? (float) $data['contract_price']
            : (isset($transaction['contract_price']) ? (float) $transaction['contract_price'] : null);
        $items = $data['items'] ?? [];
        $createdBy = (int) ($data['created_by'] ?? $transaction['created_by']);

        if ($projectId <= 0) throw new RuntimeException('กรุณาระบุ project_id');
        if ($unitId <= 0) throw new RuntimeException('กรุณาระบุ unit_id');
        if ($contractPrice === null || $contractPrice <= 0) {
            throw new RuntimeException('กรุณาระบุราคาหน้าสัญญา');
        }

        // ถ้า request ไม่ส่ง field add-on มาเลย → คงค่าเดิมไว้ (รองรับ partial update)
        $addOns = $this->normalizeAddOns($data, [
            'loan_markup_amount' => $transaction['loan_markup_amount'] ?? 0,
            'additional_expense_amount' => $transaction['additional_expense_amount'] ?? 0,
            'additional_expense_mode' => $transaction['additional_expense_mode'] ?? 'add_to_net',
        ]);

        $this->db->transBegin();

        try {
            // edit: ลบ movements เดิมออก (ไม่สร้าง RETURN — เพราะจะสร้าง USE ใหม่)
            $this->db->table("budget_movements")
                ->where("reference_id", $id)
                ->where("reference_type", "sales_transaction")
                ->delete();
            // ลบ RETURN จากการ edit ครั้งก่อน (ถ้ามี)
            $this->db->table("budget_movements")
                ->where("reference_id", $id)
                ->where("reference_type", "sales_transaction_return")
                ->delete();
            $this->deleteTransactionItems($id);

            $unit = $this->validateUnit($projectId, $unitId, true);
            $items = $this->validateItems($projectId, $unitId, $items, $saleDate, $id);
            $this->validateBudget($projectId, $unitId, $items, $id);

            $calculations = $this->calculate($items, $unit, $addOns);

            $this->db->table('sales_transactions')
                ->where('id', $id)
                ->update([
                    'project_id' => $projectId,
                    'unit_id' => $unitId,
                    'base_price' => $unit['base_price'],
                    'unit_cost' => $unit['unit_cost'],
                    'net_price' => $calculations['net_price'],
                    'total_discount' => $calculations['total_discount'],
                    'total_promo_cost' => $calculations['total_promo_cost'],
                    'total_expense_support' => $calculations['total_expense_support'],
                    'total_promo_burden' => $calculations['total_promo_burden'],
                    'total_cost' => $calculations['total_cost'],
                    'profit' => $calculations['profit'],
                    'sale_date' => $saleDate,
                    'contract_price' => $contractPrice,
                    'loan_markup_amount' => $addOns['loan_markup_amount'],
                    'additional_expense_amount' => $addOns['additional_expense_amount'],
                    'additional_expense_mode' => $addOns['additional_expense_mode'],
                    'updated_at' => date('Y-m-d H:i:s'),
                ]);

            $insertedItems = $this->insertItems($id, $items, $projectId, $createdBy);
            $movements = $this->createBudgetMovements($projectId, $unitId, $items, $createdBy, $id, $addOns);

            $this->db->table('project_units')
                ->where('id', $unitId)
                ->update([
                    'sale_date' => $saleDate,
                ]);

            $this->db->transCommit();

            return [
                'sales_transaction' => $this->db->table('sales_transactions')
                    ->where('id', $id)->get()->getRowArray(),
                'items' => $insertedItems,
                'budget_movements' => $movements,
            ];
        } catch (RuntimeException $e) {
            $this->db->transRollback();
            throw $e;
        } catch (DatabaseException $e) {
            $this->db->transRollback();
            throw new RuntimeException('เกิดข้อผิดพลาดในการบันทึก: ' . $e->getMessage());
        }
    }

    private function validateUnit(int $projectId, int $unitId, bool $isUpdate = false): array
    {
        $unit = $this->db->table('project_units')
            ->select('id, unit_code, project_id, base_price, unit_cost, standard_budget, status, sale_date')
            ->where('id', $unitId)
            ->get()->getRowArray();

        if (!$unit) {
            throw new RuntimeException('ไม่พบยูนิต');
        }

        if ((int) $unit['project_id'] !== $projectId) {
            throw new RuntimeException('ยูนิตไม่ได้อยู่ในโครงการที่ระบุ');
        }

        $allowedStatuses = $isUpdate ? ['sold'] : ['available', 'reserved'];
        if (!in_array($unit['status'], $allowedStatuses, true)) {
            throw new RuntimeException('สถานะยูนิตต้องเป็น available หรือ reserved');
        }

        return $unit;
    }

    private function validateItems(int $projectId, int $unitId, array $items, string $saleDate, ?int $excludeTransactionId = null): array
    {
        $validItems = [];
        $promotionItemIds = [];

        foreach ($items as $idx => $item) {
            $promotionItemId = (int) ($item['promotion_item_id'] ?? 0);
            $usedValue = (float) ($item['used_value'] ?? 0);

            if ($promotionItemId <= 0) {
                throw new RuntimeException("กรุณาระบุ promotion_item_id ที่รายการ " . ($idx + 1));
            }

            if (in_array($promotionItemId, $promotionItemIds, true)) {
                throw new RuntimeException('รายการของแถมซ้ำกัน: ห้ามเลือกรายการเดียวกันมากกว่า 1 ครั้ง');
            }
            $promotionItemIds[] = $promotionItemId;

            $promotionItem = $this->db->table('promotion_item_master')
                ->where('id', $promotionItemId)
                ->where('project_id', $projectId)
                ->get()->getRowArray();

            if (!$promotionItem) {
                throw new RuntimeException('ไม่พบรายการของแถม ID: ' . $promotionItemId);
            }

            $maxValue = $promotionItem['max_value'] !== null ? (float) $promotionItem['max_value'] : null;

            // unit_table: เพดานคือยอด "งบที่ตั้งไว้" รายยูนิต (resolve จากแหล่งข้อมูล เช่น คชจ ฟรีวันโอน)
            // พนักงานปรับลด used_value ได้ (งบอาจใช้ไม่หมด) แต่ห้ามเกินยอดที่ตั้งไว้
            if ($promotionItem['value_mode'] === 'unit_table') {
                $unitTableValue = $this->valueSourceSvc->resolve(
                    (string) ($promotionItem['value_source'] ?? ''),
                    $promotionItemId,
                    $unitId
                );
                if ($unitTableValue !== null) {
                    $maxValue = $maxValue !== null ? min($maxValue, $unitTableValue) : $unitTableValue;
                }
            }

            if ($maxValue !== null && $usedValue > $maxValue) {
                throw new RuntimeException(
                    "มูลค่าที่ใช้ของรายการ '{$promotionItem['name']}' ต้องไม่เกิน "
                    . number_format($maxValue, 0) . ' บาท'
                );
            }

            if (!$this->checkEligibility($promotionItem, $unitId, $saleDate)) {
                throw new RuntimeException("รายการ '{$promotionItem['name']}' ไม่สามารถใช้ได้กับยูนิตหรือวันที่ที่เลือก");
            }

            $category = $promotionItem['category'];
            $fundingSource = $item['funding_source_type'] ?? 'UNIT_STANDARD';

            // discount_convert_value: ส่วนที่แปลงเป็นส่วนลด (per-transaction, 0..used_value)
            // - เฉพาะ premium + UNIT_STANDARD เท่านั้น
            // - ถ้าไม่ส่งมา → 0 (ของแถมจริงทั้งก้อน)
            $discountConvertValue = (float) ($item['discount_convert_value'] ?? 0);
            if ($discountConvertValue < 0) {
                $discountConvertValue = 0;
            }
            if ($discountConvertValue > $usedValue) {
                throw new RuntimeException('มูลค่าที่แปลงเป็นส่วนลดต้องไม่เกินมูลค่าที่ใช้');
            }
            if ($discountConvertValue > 0 && $category !== 'premium') {
                throw new RuntimeException('สามารถแปลงเป็นส่วนลดได้เฉพาะรายการประเภท premium เท่านั้น');
            }
            if ($discountConvertValue > 0 && $fundingSource !== 'UNIT_STANDARD') {
                throw new RuntimeException('สามารถแปลงเป็นส่วนลดได้เฉพาะของแถมงบยูนิต (Panel 3A) เท่านั้น');
            }

            // convert_to_discount (legacy flag) — derive จากการแปลงทั้งก้อน
            $convertToDiscount = $discountConvertValue > 0 && $discountConvertValue >= $usedValue;

            if ($usedValue > 0) {
                $validItems[] = [
                    'promotion_item_id' => $promotionItemId,
                    'promotion_item' => $promotionItem,
                    'used_value' => $usedValue,
                    'discount_convert_value' => $discountConvertValue,
                    // effective_category สำหรับ row เก็บ DB:
                    // - แปลงทั้งก้อน → 'discount'
                    // - ไม่แปลง / split → 'premium' (หรือ category เดิม)
                    'effective_category' => $convertToDiscount ? 'discount' : $category,
                    'funding_source_type' => $fundingSource,
                    'convert_to_discount' => $convertToDiscount,
                    'manual_input_value' => $item['manual_input_value'] ?? null,
                    'remark' => $item['remark'] ?? '',
                ];
            }
        }

        return $validItems;
    }

    private function checkEligibility(array $promotionItem, int $unitId, string $saleDate): bool
    {
        $houseModels = $this->db->table('promotion_item_house_models')
            ->where('promotion_item_id', $promotionItem['id'])
            ->get()->getResultArray();
        $houseModelIds = array_column($houseModels, 'house_model_id');

        if (!empty($houseModelIds)) {
            $unit = $this->db->table('project_units')
                ->select('house_model_id')
                ->where('id', $unitId)
                ->get()->getRowArray();

            if (!empty($unit['house_model_id']) && !in_array($unit['house_model_id'], $houseModelIds, true)) {
                return false;
            }
        }

        if (!empty($promotionItem['eligible_start_date'])) {
            if ($saleDate < $promotionItem['eligible_start_date']) {
                return false;
            }
        }

        if (!empty($promotionItem['eligible_end_date'])) {
            if ($saleDate > $promotionItem['eligible_end_date']) {
                return false;
            }
        }

        $eligibleUnits = $this->db->table('promotion_item_units')
            ->where('promotion_item_id', $promotionItem['id'])
            ->get()->getResultArray();
        $eligibleUnitIds = array_column($eligibleUnits, 'unit_id');

        if (!empty($eligibleUnitIds)) {
            if (!in_array($unitId, $eligibleUnitIds, true)) {
                return false;
            }
        }

        return true;
    }

    private function validateBudget(int $projectId, int $unitId, array $items, ?int $excludeTransactionId = null): void
    {
        // ─── ถ้าโครงการอนุญาตเกินงบ → ข้าม validation ─────────────────────
        $project = $this->db->table('projects')->select('allow_over_budget')
            ->where('id', $projectId)->get()->getRowArray();
        if (!empty($project['allow_over_budget'])) {
            return;
        }

        $unitSummary = $this->budgetSvc->getUnitBudgetSummary($projectId, $unitId);

        $unitStandardTotal = 0;
        $sourceTotals = [];

        foreach ($items as $item) {
            $source = $item['funding_source_type'];
            $value = $item['used_value'];

            if ($source === 'UNIT_STANDARD') {
                $unitStandardTotal += $value;
            } else {
                if (!isset($sourceTotals[$source])) {
                    $sourceTotals[$source] = 0;
                }
                $sourceTotals[$source] += $value;
            }
        }

        $unitStandardRemaining = $unitSummary['UNIT_STANDARD']['remaining'] ?? 0;
        if ($unitStandardTotal > $unitStandardRemaining) {
            throw new RuntimeException('งบยูนิตคงเหลือไม่พอ (คงเหลือ: ' . number_format($unitStandardRemaining, 2) . ' บาท)');
        }

        foreach ($sourceTotals as $source => $total) {
            // งบผู้บริหาร (MANAGEMENT_SPECIAL) อนุญาตให้ติดลบได้ — ทีมการตลาดบริหารจัดการเอง
            if ($source === 'MANAGEMENT_SPECIAL') {
                continue;
            }
            $remaining = $unitSummary[$source]['remaining'] ?? 0;
            if ($total > $remaining) {
                throw new RuntimeException("งบ {$source} คงเหลือไม่พอ (คงเหลือ: " . number_format($remaining, 2) . " บาท)");
            }
        }
    }

    private function calculate(array $items, array $unit, array $addOns = []): array
    {
        $basePrice = (float) $unit['base_price'];

        $totalDiscount = 0;
        $totalPromoCost = 0;
        $totalExpenseSupport = 0;

        foreach ($items as $item) {
            $value = $item['used_value'];
            $category = $item['promotion_item']['category'] ?? $item['effective_category'];

            if ($category === 'premium') {
                // split: ส่วนแปลงเป็น discount + ส่วนเหลือเป็น premium จริง
                $convert = (float) ($item['discount_convert_value'] ?? 0);
                $premiumPart = $value - $convert;
                $totalDiscount += $convert;
                $totalPromoCost += $premiumPart;
            } elseif ($category === 'discount') {
                $totalDiscount += $value;
            } elseif ($category === 'expense_support') {
                $totalExpenseSupport += $value;
            }
        }

        // โหมด as_premium: ค่าธรรมเนียมโอนถือเป็น expense_support (บริษัทจ่ายให้ลูกค้า)
        // → กระทบ total_expense_support → total_promo_burden → profit ลดลง
        $addExpenseAmount = (float) ($addOns['additional_expense_amount'] ?? 0);
        $addExpenseMode = $addOns['additional_expense_mode'] ?? 'add_to_net';
        if ($addExpenseMode === 'as_premium' && $addExpenseAmount > 0) {
            $totalExpenseSupport += $addExpenseAmount;
        }

        // หมายเหตุ: loan_markup_amount และ additional_expense_amount (โหมด add_to_net)
        // เป็น virtual markup สำหรับยื่นกู้ — เก็บแยกใน column ไม่กระทบ net_price/profit ใน DB
        $netPrice = $basePrice - $totalDiscount;
        $totalPromoBurden = $totalPromoCost + $totalExpenseSupport;
        $unitCost = (float) $unit['unit_cost'];
        $totalCost = $unitCost + $totalPromoBurden;
        $profit = $netPrice - $totalCost;

        return [
            'total_discount' => round($totalDiscount, 2),
            'total_promo_cost' => round($totalPromoCost, 2),
            'total_expense_support' => round($totalExpenseSupport, 2),
            'total_promo_burden' => round($totalPromoBurden, 2),
            'net_price' => round($netPrice, 2),
            'total_cost' => round($totalCost, 2),
            'profit' => round($profit, 2),
        ];
    }

    /**
     * normalize ค่า add-on 3 ตัว — รับ default จาก row เดิม (ใช้ตอน update)
     */
    private function normalizeAddOns(array $data, array $defaults = []): array
    {
        $defaults = array_merge([
            'loan_markup_amount' => 0,
            'additional_expense_amount' => 0,
            'additional_expense_mode' => 'add_to_net',
        ], $defaults);

        $loanMarkup = array_key_exists('loan_markup_amount', $data)
            ? (float) $data['loan_markup_amount']
            : (float) $defaults['loan_markup_amount'];

        $addExpense = array_key_exists('additional_expense_amount', $data)
            ? (float) $data['additional_expense_amount']
            : (float) $defaults['additional_expense_amount'];

        $mode = array_key_exists('additional_expense_mode', $data)
            ? (string) $data['additional_expense_mode']
            : (string) $defaults['additional_expense_mode'];

        if ($loanMarkup < 0) {
            throw new RuntimeException('ขอบวกเพิ่มต้องไม่ติดลบ');
        }
        if ($addExpense < 0) {
            throw new RuntimeException('ค่าใช้จ่ายบวกเพิ่มต้องไม่ติดลบ');
        }
        if (!in_array($mode, ['add_to_net', 'as_premium', 'as_unit_expense'], true)) {
            throw new RuntimeException('โหมดค่าใช้จ่ายบวกเพิ่มไม่ถูกต้อง');
        }

        return [
            'loan_markup_amount' => round($loanMarkup, 2),
            'additional_expense_amount' => round($addExpense, 2),
            'additional_expense_mode' => $mode,
        ];
    }

    /**
     * ออกเลขที่บันทึกขาย — ใช้ NumberSeriesService (SELECT ... FOR UPDATE ป้องกัน race condition)
     */
    private function generateSaleNo(int $projectId, ?int $createdBy = null): string
    {
        return $this->numberSeriesSvc->generate(
            $projectId,
            'SALE',
            null,
            'sales_transactions',
            $createdBy
        );
    }

    private function insertTransaction(array $data): int
    {
        $this->db->table('sales_transactions')->insert($data);
        return (int) $this->db->insertID();
    }

    private function insertItems(int $transactionId, array $items, int $projectId, int $createdBy): array
    {
        $inserted = [];
        $now = date('Y-m-d H:i:s');

        foreach ($items as $item) {
            $this->db->table('sales_transaction_items')->insert([
                'sales_transaction_id' => $transactionId,
                'promotion_item_id' => $item['promotion_item_id'],
                'original_category' => $item['promotion_item']['category'],
                'effective_category' => $item['effective_category'],
                'used_value' => $item['used_value'],
                'discount_convert_value' => $item['discount_convert_value'] ?? 0,
                'funding_source_type' => $item['funding_source_type'],
                'convert_to_discount' => $item['convert_to_discount'] ? 1 : 0,
                'manual_input_value' => $item['manual_input_value'],
                'remark' => $item['remark'],
                'created_at' => $now,
            ]);

            $inserted[] = $this->db->table('sales_transaction_items')
                ->where('id', $this->db->insertID())->get()->getRowArray();
        }

        return $inserted;
    }

    private function createBudgetMovements(int $projectId, int $unitId, array $items, int $createdBy, ?int $transactionId = null, array $addOns = []): array
    {
        $movements = [];

        foreach ($items as $item) {
            $source = $item['funding_source_type'];
            $amount = $item['used_value'];

            $movementType = match ($source) {
                'UNIT_STANDARD' => 'USE',
                'PROJECT_POOL' => 'USE',
                'MANAGEMENT_SPECIAL' => 'SPECIAL_BUDGET_USE',
                default => 'USE',
            };

            $movementNo = $this->generateMovementNo($projectId);
            $status = 'approved'; // อนุมัติทันทีเสมอ — ไม่มีขั้นตอนรออนุมัติงบแล้ว
            $now = date('Y-m-d H:i:s');

            $this->db->table('budget_movements')->insert([
                'movement_no' => $movementNo,
                'project_id' => $projectId,
                'unit_id' => $unitId,
                'movement_type' => $movementType,
                'budget_source_type' => $source,
                'amount' => $amount,
                'status' => $status,
                'reference_id' => $transactionId,
                'reference_type' => 'sales_transaction',
                'created_by' => $createdBy,
                'approved_by' => $createdBy,
                'approved_at' => $now,
                'created_at' => $now,
            ]);

            $movements[] = $this->db->table('budget_movements')
                ->where('id', $this->db->insertID())->get()->getRowArray();
        }

        // ค่าธรรมเนียมโอน โหมด as_premium → หักงบผู้บริหาร (MANAGEMENT_SPECIAL)
        $addExpenseAmount = (float) ($addOns['additional_expense_amount'] ?? 0);
        $addExpenseMode = $addOns['additional_expense_mode'] ?? 'add_to_net';
        if ($addExpenseMode === 'as_premium' && $addExpenseAmount > 0) {
            $movementNo = $this->generateMovementNo($projectId);
            $status = 'approved'; // อนุมัติทันทีเสมอ — ไม่มีขั้นตอนรออนุมัติงบแล้ว
            $now = date('Y-m-d H:i:s');

            $this->db->table('budget_movements')->insert([
                'movement_no' => $movementNo,
                'project_id' => $projectId,
                'unit_id' => $unitId,
                'movement_type' => 'SPECIAL_BUDGET_USE',
                'budget_source_type' => 'MANAGEMENT_SPECIAL',
                'amount' => $addExpenseAmount,
                'status' => $status,
                'reference_id' => $transactionId,
                'reference_type' => 'sales_transaction',
                'note' => 'ค่าธรรมเนียมโอน — ของแถมเพิ่มเติม',
                'created_by' => $createdBy,
                'approved_by' => $createdBy,
                'approved_at' => $now,
                'created_at' => $now,
            ]);

            $movements[] = $this->db->table('budget_movements')
                ->where('id', $this->db->insertID())->get()->getRowArray();
        }

        return $movements;
    }

    /**
     * ออกเลขที่เคลื่อนไหวงบ — ใช้ NumberSeriesService (SELECT ... FOR UPDATE ป้องกัน race condition)
     */
    private function generateMovementNo(int $projectId, ?int $createdBy = null): string
    {
        return $this->numberSeriesSvc->generate(
            $projectId,
            'BUDGET_MOVE',
            null,
            'budget_movements',
            $createdBy
        );
    }

    private function updateUnitStatus(int $unitId, string $saleDate): void
    {
        $this->db->table('project_units')
            ->where('id', $unitId)
            ->update([
                'status' => 'sold',
                'sale_date' => $saleDate,
                'updated_at' => date('Y-m-d H:i:s'),
            ]);
    }

    private function returnBudgetMovements(int $transactionId, int $projectId, int $unitId, int $createdBy): void
    {
        $existingMovements = $this->db->table('budget_movements')
            ->where('reference_id', $transactionId)
            ->where('reference_type', 'sales_transaction')
            ->get()->getResultArray();

        foreach ($existingMovements as $movement) {
            $returnType = match ($movement['budget_source_type']) {
                'UNIT_STANDARD' => 'RETURN',
                'PROJECT_POOL' => 'RETURN',
                'MANAGEMENT_SPECIAL' => 'SPECIAL_BUDGET_RETURN',
                default => 'RETURN',
            };

            $movementNo = $this->generateMovementNo($projectId);
            $status = 'approved'; // อนุมัติทันทีเสมอ — ไม่มีขั้นตอนรออนุมัติงบแล้ว
            $now = date('Y-m-d H:i:s');

            $this->db->table('budget_movements')->insert([
                'movement_no' => $movementNo,
                'project_id' => $projectId,
                'unit_id' => $unitId,
                'movement_type' => $returnType,
                'budget_source_type' => $movement['budget_source_type'],
                'amount' => $movement['amount'],
                'status' => $status,
                'reference_id' => $transactionId,
                'reference_type' => 'sales_transaction_return',
                'note' => 'คืนงบจากการแก้ไขรายการขาย',
                'created_by' => $createdBy,
                'approved_by' => $createdBy,
                'approved_at' => $now,
                'created_at' => $now,
            ]);
        }

        $this->db->table('budget_movements')
            ->where('reference_id', $transactionId)
            ->where('reference_type', 'sales_transaction')
            ->delete();
    }

    private function deleteTransactionItems(int $transactionId): void
    {
        $this->db->table('sales_transaction_items')
            ->where('sales_transaction_id', $transactionId)
            ->delete();
    }
}
