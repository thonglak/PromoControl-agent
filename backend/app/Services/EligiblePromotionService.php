<?php

namespace App\Services;

use CodeIgniter\Database\BaseConnection;
use RuntimeException;

/**
 * ดึงรายการของแถมที่ eligible สำหรับยูนิตที่เลือก
 * ใช้สำหรับ Sales Entry — แยก Panel 3A / 3B พร้อม pre-calculate สูตร
 */
class EligiblePromotionService
{
    private BaseConnection $db;
    private FormulaExpressionEvaluator $evaluator;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
        $this->evaluator = new FormulaExpressionEvaluator();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Public: ดึงรายการ eligible แยก panel_a / panel_b
    // ═══════════════════════════════════════════════════════════════════════

    public function getEligibleItems(int $projectId, int $unitId, string $saleDate, ?float $contractPrice = null, ?float $netPrice = null): array
    {
        // โหลดข้อมูลยูนิต + project-level vars (สำหรับ expression formulas)
        $unit = $this->db->table('project_units pu')
            ->select('pu.*, pr.project_type, pr.approval_required, pr.common_fee_rate, pr.electric_meter_fee, pr.water_meter_fee, pr.pool_budget_amount')
            ->join('projects pr', 'pr.id = pu.project_id', 'left')
            ->where('pu.id', $unitId)
            ->get()->getRowArray();

        if (!$unit) {
            throw new RuntimeException('ไม่พบยูนิต');
        }

        if ((int) $unit['project_id'] !== $projectId) {
            throw new RuntimeException('ยูนิตไม่ได้อยู่ในโครงการที่ระบุ');
        }

        // โหลดของแถมทั้งหมดของโครงการ (เฉพาะ active)
        $items = $this->db->table('promotion_item_master')
            ->where('project_id', $projectId)
            ->where('is_active', 1)
            ->orderBy('sort_order', 'ASC')
            ->orderBy('name', 'ASC')
            ->get()->getResultArray();

        // โหลด eligibility data แบบ batch (ลดจำนวน query)
        $itemIds = array_column($items, 'id');

        $houseModelMap = $this->loadHouseModelEligibility($itemIds);
        $unitEligMap   = $this->loadUnitEligibility($itemIds);
        $formulaMap    = $this->loadFormulasWithPolicies($itemIds);

        $panelA = [];
        $panelB = [];

        foreach ($items as $item) {
            $id = (int) $item['id'];

            // ตรวจ eligibility
            if (!$this->checkEligibility($item, $unit, $saleDate, $houseModelMap[$id] ?? [], $unitEligMap[$id] ?? [])) {
                continue;
            }

            // สร้าง response item
            $responseItem = $this->buildResponseItem($item, $unit, $saleDate, $formulaMap[$id] ?? null, $contractPrice, $netPrice);

            if ($item['is_unit_standard']) {
                $panelA[] = $responseItem;
            } else {
                $panelB[] = $responseItem;
            }
        }

        return [
            'panel_a' => $panelA,
            'panel_b' => $panelB,
            'unit'    => [
                'id'              => (int) $unit['id'],
                'unit_code'       => $unit['unit_code'],
                'base_price'      => (float) $unit['base_price'],
                'unit_cost'       => (float) $unit['unit_cost'],
                'appraisal_price' => $unit['appraisal_price'] !== null ? (float) $unit['appraisal_price'] : null,
                'standard_budget' => (float) $unit['standard_budget'],
                'house_model_id'  => $unit['house_model_id'] ? (int) $unit['house_model_id'] : null,
                'status'          => $unit['status'],
            ],
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Private: Batch loading (ลด N+1 query)
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * โหลด house model eligibility ทั้งหมด → map[item_id] = [house_model_id, ...]
     */
    private function loadHouseModelEligibility(array $itemIds): array
    {
        if (empty($itemIds)) return [];

        $rows = $this->db->table('promotion_item_house_models')
            ->whereIn('promotion_item_id', $itemIds)
            ->get()->getResultArray();

        $map = [];
        foreach ($rows as $row) {
            $map[(int) $row['promotion_item_id']][] = (int) $row['house_model_id'];
        }
        return $map;
    }

    /**
     * โหลด unit eligibility ทั้งหมด → map[item_id] = [unit_id, ...]
     */
    private function loadUnitEligibility(array $itemIds): array
    {
        if (empty($itemIds)) return [];

        $rows = $this->db->table('promotion_item_units')
            ->whereIn('promotion_item_id', $itemIds)
            ->get()->getResultArray();

        $map = [];
        foreach ($rows as $row) {
            $map[(int) $row['promotion_item_id']][] = (int) $row['unit_id'];
        }
        return $map;
    }

    /**
     * โหลด fee_formulas + fee_rate_policies แบบ batch → map[item_id] = formula + policies
     */
    private function loadFormulasWithPolicies(array $itemIds): array
    {
        if (empty($itemIds)) return [];

        $formulas = $this->db->table('fee_formulas')
            ->whereIn('promotion_item_id', $itemIds)
            ->get()->getResultArray();

        if (empty($formulas)) return [];

        $formulaIds = array_column($formulas, 'id');
        $policies = $this->db->table('fee_rate_policies')
            ->whereIn('fee_formula_id', $formulaIds)
            ->orderBy('priority', 'DESC')
            ->orderBy('effective_from', 'DESC')
            ->get()->getResultArray();

        // จัดกลุ่ม policies ตาม formula_id
        $policyMap = [];
        foreach ($policies as $policy) {
            $policyMap[(int) $policy['fee_formula_id']][] = $policy;
        }

        // จัดกลุ่ม formulas ตาม promotion_item_id
        $map = [];
        foreach ($formulas as $formula) {
            $fId = (int) $formula['id'];
            $formula['policies'] = $policyMap[$fId] ?? [];
            $map[(int) $formula['promotion_item_id']] = $formula;
        }

        return $map;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Private: Eligibility check
    // ═══════════════════════════════════════════════════════════════════════

    private function checkEligibility(
        array $item,
        array $unit,
        string $saleDate,
        array $eligibleHouseModelIds,
        array $eligibleUnitIds
    ): bool {
        // 1. ตรวจแบบบ้าน: ถ้ามี list → unit.house_model_id ต้องอยู่ใน list
        //    ถ้า unit ไม่มี house_model_id (null) → ผ่าน
        if (!empty($eligibleHouseModelIds)) {
            $unitHouseModelId = $unit['house_model_id'] ? (int) $unit['house_model_id'] : null;
            if ($unitHouseModelId !== null && !in_array($unitHouseModelId, $eligibleHouseModelIds, true)) {
                return false;
            }
        }

        // 2. ตรวจระยะเวลา
        if (!empty($item['eligible_start_date']) && $saleDate < $item['eligible_start_date']) {
            return false;
        }
        if (!empty($item['eligible_end_date']) && $saleDate > $item['eligible_end_date']) {
            return false;
        }

        // 3. ตรวจยูนิต: ถ้ามี list → unit_id ต้องอยู่ใน list
        if (!empty($eligibleUnitIds)) {
            if (!in_array((int) $unit['id'], $eligibleUnitIds, true)) {
                return false;
            }
        }

        return true;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Private: Build response item
    // ═══════════════════════════════════════════════════════════════════════

    private function buildResponseItem(array $item, array $unit, string $saleDate, ?array $formula, ?float $contractPrice = null, ?float $netPrice = null): array
    {
        $result = [
            'id'                 => (int) $item['id'],
            'code'               => $item['code'],
            'name'               => $item['name'],
            'category'           => $item['category'],
            'value_mode'         => $item['value_mode'],
            'max_value'          => $item['max_value'] !== null ? (float) $item['max_value'] : null,
            'default_used_value' => $item['default_used_value'] !== null ? (float) $item['default_used_value'] : null,
            'default_value'      => $item['default_value'] !== null ? (float) $item['default_value'] : null,
            'sort_order'         => (int) $item['sort_order'],
            'is_unit_standard'   => (bool) $item['is_unit_standard'],
        ];

        // สำหรับ calculated items — pre-calculate ค่า
        if ($item['value_mode'] === 'calculated' && $formula) {
            $calcResult = $this->calculateFormula($formula, $unit, $saleDate, $contractPrice, $netPrice);
            $result['fee_formula']            = $calcResult['fee_formula'];
            $result['calculated_value']       = $calcResult['calculated_value'];
            $result['effective_rate']         = $calcResult['effective_rate'];
            $result['effective_buyer_share']  = $calcResult['effective_buyer_share'];
            $result['formula_display']        = $calcResult['formula_display'];
            $result['applied_policy_name']    = $calcResult['applied_policy_name'] ?? null;
            $result['warnings']               = $calcResult['warnings'];
        } else {
            $result['fee_formula']            = null;
            $result['calculated_value']       = null;
            $result['effective_rate']         = null;
            $result['effective_buyer_share']  = null;
            $result['formula_display']        = null;
            $result['applied_policy_name']    = null;
            $result['warnings']               = [];
        }

        return $result;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Private: Calculate formula + policy matching
    // ═══════════════════════════════════════════════════════════════════════

    private function calculateFormula(array $formula, array $unit, string $saleDate, ?float $contractPrice = null, ?float $netPrice = null): array
    {
        $warnings = [];
        $baseField = $formula['base_field'];

        // 1. หา base_amount ตาม base_field
        $baseAmount = 0;
        $baseLabel = '';
        $needsManualInput = false;
        $isExpression = false;
        $expressionResult = null;

        switch ($baseField) {
            case 'appraisal_price':
                $baseLabel = 'ราคาประเมิน';
                if ($unit['appraisal_price'] === null || (float) $unit['appraisal_price'] == 0) {
                    $warnings[] = 'ยังไม่มีราคาประเมิน';
                    $baseAmount = 0;
                } else {
                    $baseAmount = (float) $unit['appraisal_price'];
                }
                break;

            case 'base_price':
                $baseLabel = 'ราคาขาย';
                $baseAmount = (float) $unit['base_price'];
                break;

            case 'net_price':
                $baseLabel = 'ราคาสุทธิ';
                // ใช้ net_price ที่ FE ส่งมา (คำนวณจากส่วนลดปัจจุบัน) ถ้าไม่มี → fallback เป็น base_price
                if ($netPrice !== null && $netPrice > 0) {
                    $baseAmount = (float) $netPrice;
                } else {
                    $baseAmount = (float) $unit['base_price'];
                    $warnings[] = 'ค่าฐานใช้ราคาขาย (ยังไม่ได้หักส่วนลด) — จะคำนวณใหม่อัตโนมัติเมื่อใส่ส่วนลด';
                }
                break;

            case 'manual_input':
                $baseLabel = $formula['manual_input_label'] ?? 'กรอกค่าฐาน';
                $needsManualInput = true;
                $baseAmount = 0;
                break;

            case 'expression':
                $isExpression = true;
                $baseLabel = 'นิพจน์';
                $expr = trim((string) ($formula['formula_expression'] ?? ''));
                $usedVars = $this->evaluator->extractVariables($expr);
                $needsContract = in_array('contract_price', $usedVars, true);

                // ถ้าสูตรใช้ contract_price แต่ยังไม่มี → mark warning
                if ($needsContract && ($contractPrice === null || $contractPrice <= 0)) {
                    $warnings[] = 'รอกรอกราคาหน้าสัญญา';
                    $expressionResult = null;
                    $baseAmount = 0;
                } else {
                    try {
                        $context = $this->buildExpressionContext($unit, $contractPrice, $netPrice);
                        $expressionResult = $this->evaluator->evaluate($expr, $context);
                        $baseAmount = $expressionResult;
                    } catch (\Throwable $e) {
                        $warnings[] = 'คำนวณสูตรไม่สำเร็จ: ' . $e->getMessage();
                        $expressionResult = null;
                        $baseAmount = 0;
                    }
                }
                break;
        }

        // 2. Match policies — ตรวจทุก policy แล้วระบุ is_matched
        $defaultRate = (float) $formula['default_rate'];
        $buyerShare  = (float) $formula['buyer_share'];

        $policiesResult = [];
        $appliedPolicy  = null;

        foreach ($formula['policies'] as $policy) {
            if (!(int) $policy['is_active']) continue;

            // ตรวจช่วงเวลา
            $inDateRange = ($saleDate >= $policy['effective_from'] && $saleDate <= $policy['effective_to']);

            // ตรวจ conditions — รองรับทั้ง expression และ legacy JSON
            $conditions = json_decode($policy['conditions'] ?? '{}', true) ?: [];
            $conditionsPassed = true;
            $matchReasons = [];

            if ($inDateRange) {
                $matchReasons[] = 'ช่วงเวลาตรง ✓';
            } else {
                $conditionsPassed = false;
                $matchReasons[] = "ช่วงเวลาไม่ตรง ({$policy['effective_from']} ~ {$policy['effective_to']}) ✗";
            }

            // Expression-based condition (มาก่อน — ถ้ามีจะข้าม legacy)
            if (!empty($policy['condition_expression'])) {
                $condExpr = $policy['condition_expression'];
                try {
                    $exprContext = $this->buildExpressionContext($unit, $contractPrice, $netPrice);
                    $boolResult = $this->evaluator->evaluateBoolean($condExpr, $exprContext);
                    if ($boolResult) {
                        $matchReasons[] = "เงื่อนไข [{$condExpr}] = true ✓";
                    } else {
                        $conditionsPassed = false;
                        $matchReasons[] = "เงื่อนไข [{$condExpr}] = false ✗";
                    }
                } catch (\Throwable $e) {
                    $conditionsPassed = false;
                    $matchReasons[] = 'เงื่อนไข error: ' . $e->getMessage();
                }
            } else {
                // Legacy JSON conditions
                if (isset($conditions['max_base_price'])) {
                    $threshold = (float) $conditions['max_base_price'];
                    $actual    = (float) $unit['base_price'];
                    if ($actual <= $threshold) {
                        $matchReasons[] = 'base_price ' . number_format($actual, 0, '.', ',') . ' ≤ ' . number_format($threshold, 0, '.', ',') . ' ✓';
                    } else {
                        $conditionsPassed = false;
                        $matchReasons[] = 'base_price ' . number_format($actual, 0, '.', ',') . ' > ' . number_format($threshold, 0, '.', ',') . ' ✗';
                    }
                }

                if (isset($conditions['project_types']) && is_array($conditions['project_types'])) {
                    $projectType = $unit['project_type'] ?? '';
                    if (in_array($projectType, $conditions['project_types'], true)) {
                        $matchReasons[] = "project_type '{$projectType}' ตรง ✓";
                    } else {
                        $conditionsPassed = false;
                        $matchReasons[] = "project_type '{$projectType}' ไม่ตรง ✗";
                    }
                }
            }

            $isMatched = $inDateRange && $conditionsPassed;

            $policiesResult[] = [
                'id'                   => (int) $policy['id'],
                'policy_name'          => $policy['policy_name'],
                'override_rate'        => (float) $policy['override_rate'],
                'override_buyer_share' => $policy['override_buyer_share'] !== null ? (float) $policy['override_buyer_share'] : null,
                'override_expression'  => $policy['override_expression'] ?? null,
                'condition_expression' => $policy['condition_expression'] ?? null,
                'priority'             => (int) $policy['priority'],
                'effective_from'       => $policy['effective_from'],
                'effective_to'         => $policy['effective_to'],
                'conditions'           => $conditions,
                'is_matched'           => $isMatched,
                'match_reason'         => implode(', ', $matchReasons),
            ];

            // ใช้ policy แรกที่ matched (priority DESC จาก query)
            if ($isMatched && !$appliedPolicy) {
                $appliedPolicy = $policy;
            }
        }

        // 3. Effective rate (legacy — ใช้กรณี expression mode หรือ override_rate ถ้าไม่มี override_expression)
        $effectiveRate = $appliedPolicy ? (float) $appliedPolicy['override_rate'] : $defaultRate;
        $effectiveBuyerShare = ($appliedPolicy && $appliedPolicy['override_buyer_share'] !== null)
            ? (float) $appliedPolicy['override_buyer_share']
            : $buyerShare;

        // 4. คำนวณ
        if ($isExpression) {
            // expression mode: ใช้ override_expression ของ policy ถ้ามี + matched
            if ($appliedPolicy && !empty($appliedPolicy['override_expression'])) {
                try {
                    $exprContext = $this->buildExpressionContext($unit, $contractPrice, $netPrice);
                    $calculatedValue = $this->evaluator->evaluate($appliedPolicy['override_expression'], $exprContext);
                } catch (\Throwable $e) {
                    $warnings[] = 'override expression error: ' . $e->getMessage();
                    $calculatedValue = $expressionResult ?? 0;
                }
            } else {
                $calculatedValue = $expressionResult ?? 0;
            }
        } else {
            $calculatedValue = $baseAmount * $effectiveRate * $effectiveBuyerShare;
        }

        // 5. Cap ที่ max_value
        $maxValue = $formula['item_max_value'] ?? null;
        if ($maxValue === null) {
            // ดึงจาก item (ถ้า formula ไม่มี field นี้)
            $itemRow = $this->db->table('promotion_item_master')
                ->select('max_value')
                ->where('id', $formula['promotion_item_id'])
                ->get()->getRowArray();
            $maxValue = $itemRow['max_value'] ?? null;
        }
        $capped = false;
        if ($maxValue !== null && $calculatedValue > (float) $maxValue) {
            $calculatedValue = (float) $maxValue;
            $capped = true;
        }
        $calculatedValue = round($calculatedValue, 2);

        // 6. สร้าง formula_display (ภาษาไทย)
        if ($isExpression) {
            $formulaDisplay = $this->buildExpressionDisplay(
                $formula['formula_expression'] ?? '',
                $expressionResult,
                $calculatedValue,
                $capped,
                $maxValue,
                count($warnings) > 0,
                $appliedPolicy
            );
        } else {
            $formulaDisplay = $this->buildFormulaDisplay(
                $baseLabel, $baseAmount, $effectiveRate, $effectiveBuyerShare,
                $calculatedValue, $appliedPolicy, $needsManualInput, $capped, $maxValue
            );
        }

        return [
            'fee_formula' => [
                'id'                 => (int) $formula['id'],
                'base_field'         => $baseField,
                'default_rate'       => $defaultRate,
                'buyer_share'        => $buyerShare,
                'manual_input_label' => $formula['manual_input_label'] ?? null,
                'formula_expression' => $formula['formula_expression'] ?? null,
                'description'        => $formula['description'] ?? null,
                'policies'           => $policiesResult,
            ],
            'calculated_value'       => $calculatedValue,
            'effective_rate'         => $effectiveRate,
            'effective_buyer_share'  => $effectiveBuyerShare,
            'formula_display'        => $formulaDisplay,
            'applied_policy_name'    => $appliedPolicy ? (string) $appliedPolicy['policy_name'] : null,
            'warnings'               => $warnings,
        ];
    }

    /**
     * สร้างข้อความแสดงสูตร (ภาษาไทย)
     */
    private function buildFormulaDisplay(
        string $baseLabel,
        float  $baseAmount,
        float  $effectiveRate,
        float  $effectiveBuyerShare,
        float  $calculatedValue,
        ?array $appliedPolicy,
        bool   $needsManualInput,
        bool   $capped,
        $maxValue
    ): string {
        if ($needsManualInput) {
            $ratePercent = $this->formatRatePercent($effectiveRate * $effectiveBuyerShare);
            $policyName = $appliedPolicy ? " ({$appliedPolicy['policy_name']})" : '';
            return "{$baseLabel} × {$ratePercent}{$policyName} — รอกรอกค่าฐาน";
        }

        if ($baseAmount == 0) {
            return "ไม่สามารถคำนวณได้ (ไม่มีค่าฐาน)";
        }

        $baseFormatted = number_format($baseAmount, 0, '.', ',');
        $ratePercent = $this->formatRatePercent($effectiveRate * $effectiveBuyerShare);
        $valueFormatted = number_format($calculatedValue, 0, '.', ',');
        $policyName = $appliedPolicy ? " ({$appliedPolicy['policy_name']})" : '';
        $cappedText = $capped ? ' [จำกัดเพดาน ' . number_format((float) $maxValue, 0, '.', ',') . ']' : '';

        return "{$baseLabel} {$baseFormatted} × {$ratePercent} = {$valueFormatted}{$policyName}{$cappedText}";
    }

    /**
     * แปลง rate เป็น % แบบอ่านง่าย
     */
    private function formatRatePercent(float $rate): string
    {
        $percent = $rate * 100;
        // ตัดทศนิยมท้ายที่เป็น 0
        if ($percent == floor($percent)) {
            return number_format($percent, 0) . '%';
        }
        return rtrim(rtrim(number_format($percent, 4, '.', ''), '0'), '.') . '%';
    }

    /**
     * สร้าง context ของตัวแปรทั้งหมดสำหรับ evaluator
     * — รวม project + unit + transaction
     */
    private function buildExpressionContext(array $unit, ?float $contractPrice, ?float $netPrice = null): array
    {
        return [
            // Project-level
            'common_fee_rate'    => (float) ($unit['common_fee_rate'] ?? 0),
            'electric_meter_fee' => (float) ($unit['electric_meter_fee'] ?? 0),
            'water_meter_fee'    => (float) ($unit['water_meter_fee'] ?? 0),
            'pool_budget_amount' => (float) ($unit['pool_budget_amount'] ?? 0),

            // Unit-level
            'base_price'      => (float) ($unit['base_price'] ?? 0),
            'unit_cost'       => (float) ($unit['unit_cost'] ?? 0),
            'appraisal_price' => (float) ($unit['appraisal_price'] ?? 0),
            'land_area_sqw'   => (float) ($unit['land_area_sqw'] ?? 0),
            'area_sqm'        => (float) ($unit['area_sqm'] ?? 0),
            'standard_budget' => (float) ($unit['standard_budget'] ?? 0),

            // Transaction-level
            'contract_price' => (float) ($contractPrice ?? 0),
            // ใช้ net_price ที่ FE คำนวณส่งมา (base_price - ผลรวมส่วนลด); ถ้าไม่ส่ง → fallback เป็น base_price
            'net_price'      => $netPrice !== null && $netPrice > 0
                ? (float) $netPrice
                : (float) ($unit['base_price'] ?? 0),
        ];
    }

    /**
     * สร้างข้อความแสดงสูตรสำหรับโหมด expression
     * - ถ้ามี policy match + override_expression → แสดงทั้งสูตรเดิม + override
     */
    private function buildExpressionDisplay(
        string $expression,
        ?float $result,
        float $calculatedValue,
        bool $capped,
        $maxValue,
        bool $hasWarning,
        ?array $appliedPolicy = null
    ): string {
        if ($hasWarning || $result === null) {
            return "นิพจน์: {$expression} — รอข้อมูลครบ";
        }
        $valueFormatted = number_format($calculatedValue, 0, '.', ',');
        $cappedText = $capped ? ' [จำกัดเพดาน ' . number_format((float) $maxValue, 0, '.', ',') . ']' : '';

        // มี override_expression จาก policy → แสดงทั้งสูตรเดิม + override
        if ($appliedPolicy && !empty($appliedPolicy['override_expression'])) {
            $overrideExpr = (string) $appliedPolicy['override_expression'];
            return "สูตรเดิม: {$expression} → Override: {$overrideExpr} = {$valueFormatted}{$cappedText}";
        }

        return "{$expression} = {$valueFormatted}{$cappedText}";
    }
}
