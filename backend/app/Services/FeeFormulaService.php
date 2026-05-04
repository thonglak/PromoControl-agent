<?php

namespace App\Services;

use CodeIgniter\Database\BaseConnection;
use RuntimeException;

class FeeFormulaService
{
    private BaseConnection $db;
    private FormulaExpressionEvaluator $evaluator;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
        $this->evaluator = new FormulaExpressionEvaluator();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Fee Formulas CRUD
    // ═══════════════════════════════════════════════════════════════════════

    public function listFormulas(?int $projectId = null): array
    {
        $builder = $this->db->table("fee_formulas f")
            ->select("f.*, p.name AS promotion_item_name, p.code AS promotion_item_code, p.category AS promotion_item_category, p.max_value AS item_max_value")
            ->join("promotion_item_master p", "p.id = f.promotion_item_id", "left");
        if ($projectId) $builder->where("p.project_id", $projectId);
        $rows = $builder->orderBy("p.sort_order", "ASC")->get()->getResultArray();

        foreach ($rows as &$row) {
            $row['policies_count'] = (int) $this->db->table('fee_rate_policies')
                ->where('fee_formula_id', $row['id'])->countAllResults();
            $row['active_policies_count'] = (int) $this->db->table('fee_rate_policies')
                ->where('fee_formula_id', $row['id'])->where('is_active', 1)->countAllResults();
        }

        return $rows;
    }

    public function getFormula(int $id): ?array
    {
        $row = $this->db->table('fee_formulas f')
            ->select('f.*, p.name AS promotion_item_name, p.code AS promotion_item_code, p.category AS promotion_item_category, p.max_value AS item_max_value')
            ->join('promotion_item_master p', 'p.id = f.promotion_item_id', 'left')
            ->where('f.id', $id)->get()->getRowArray();

        if (!$row) return null;

        $row['policies'] = $this->db->table('fee_rate_policies')
            ->where('fee_formula_id', $id)->orderBy('priority', 'DESC')->get()->getResultArray();

        return $row;
    }

    public function createFormula(array $data): array
    {
        // Validate promotion_item
        $item = $this->db->table('promotion_item_master')->where('id', $data['promotion_item_id'] ?? 0)->get()->getRowArray();
        if (!$item) throw new RuntimeException('ไม่พบรายการของแถม');
        if ($item['value_mode'] !== 'calculated') throw new RuntimeException('รายการนี้ต้องเป็นโหมด "คำนวณอัตโนมัติ" เท่านั้น');

        $existing = $this->db->table('fee_formulas')->where('promotion_item_id', $data['promotion_item_id'])->countAllResults();
        if ($existing > 0) throw new RuntimeException('รายการนี้มีสูตรผูกอยู่แล้ว (1 รายการ : 1 สูตร)');

        if (($data['base_field'] ?? '') === 'manual_input' && empty($data['manual_input_label'])) {
            throw new RuntimeException('กรุณาระบุชื่อช่องกรอก (manual_input_label)');
        }

        // expression mode: ตรวจ syntax + ตัวแปร
        $formulaExpression = null;
        if (($data['base_field'] ?? '') === 'expression') {
            $formulaExpression = trim((string) ($data['formula_expression'] ?? ''));
            $check = $this->evaluator->validate($formulaExpression);
            if (!$check['valid']) {
                throw new RuntimeException('สูตรไม่ถูกต้อง: ' . $check['error']);
            }
        }

        $now = date('Y-m-d H:i:s');
        $this->db->table('fee_formulas')->insert([
            'promotion_item_id' => (int) $data['promotion_item_id'],
            'base_field'        => $data['base_field'],
            'manual_input_label' => $data['manual_input_label'] ?? null,
            'formula_expression' => $formulaExpression,
            'default_rate'      => (float) ($data['default_rate'] ?? 0),
            'buyer_share'       => (float) ($data['buyer_share'] ?? 1),
            'description'       => $data['description'] ?? null,
            'created_at'        => $now,
            'updated_at'        => $now,
        ]);

        return $this->getFormula($this->db->insertID());
    }

    public function updateFormula(int $id, array $data): array
    {
        $existing = $this->db->table('fee_formulas')->where('id', $id)->get()->getRowArray();
        if (!$existing) throw new RuntimeException('ไม่พบสูตร');

        if (($data['base_field'] ?? '') === 'manual_input' && empty($data['manual_input_label'])) {
            throw new RuntimeException('กรุณาระบุชื่อช่องกรอก');
        }

        $newBaseField = $data['base_field'] ?? $existing['base_field'];
        $formulaExpression = $existing['formula_expression'] ?? null;

        if ($newBaseField === 'expression') {
            $formulaExpression = trim((string) ($data['formula_expression'] ?? $existing['formula_expression'] ?? ''));
            $check = $this->evaluator->validate($formulaExpression);
            if (!$check['valid']) {
                throw new RuntimeException('สูตรไม่ถูกต้อง: ' . $check['error']);
            }
        } elseif (array_key_exists('formula_expression', $data)) {
            // ถ้า base_field ไม่ใช่ expression แต่ส่ง formula_expression มา → set null
            $formulaExpression = null;
        }

        $this->db->table('fee_formulas')->where('id', $id)->update([
            'base_field'         => $newBaseField,
            'manual_input_label' => $data['manual_input_label'] ?? null,
            'formula_expression' => $formulaExpression,
            'default_rate'       => (float) ($data['default_rate'] ?? $existing['default_rate']),
            'buyer_share'        => (float) ($data['buyer_share'] ?? $existing['buyer_share']),
            'description'        => $data['description'] ?? $existing['description'],
            'updated_at'         => date('Y-m-d H:i:s'),
        ]);

        return $this->getFormula($id);
    }

    public function deleteFormula(int $id): void
    {
        $existing = $this->db->table('fee_formulas')->where('id', $id)->get()->getRowArray();
        if (!$existing) throw new RuntimeException('ไม่พบสูตร');

        // ตรวจว่ามี sales ใช้อยู่ไหม
        $used = $this->db->table('sales_transaction_items')
            ->where('promotion_item_id', $existing['promotion_item_id'])->countAllResults();
        if ($used > 0) throw new RuntimeException('สูตรนี้ถูกใช้ในการบันทึกขายแล้ว ไม่สามารถลบได้');

        $this->db->transBegin();
        try {
            $this->db->table('fee_rate_policies')->where('fee_formula_id', $id)->delete();
            $this->db->table('fee_formulas')->where('id', $id)->delete();
            // Reset value_mode กลับเป็น fixed
            $this->db->table('promotion_item_master')
                ->where('id', $existing['promotion_item_id'])
                ->update(['value_mode' => 'fixed']);
            $this->db->transCommit();
        } catch (\Throwable $e) {
            $this->db->transRollback();
            throw new RuntimeException('ลบสูตรไม่สำเร็จ: ' . $e->getMessage());
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Fee Rate Policies CRUD
    // ═══════════════════════════════════════════════════════════════════════

    public function listPolicies(int $formulaId): array
    {
        return $this->db->table('fee_rate_policies p')
            ->select('p.*, f.promotion_item_id, pi.name AS promotion_item_name')
            ->join('fee_formulas f', 'f.id = p.fee_formula_id', 'left')
            ->join('promotion_item_master pi', 'pi.id = f.promotion_item_id', 'left')
            ->where('p.fee_formula_id', $formulaId)
            ->orderBy('p.priority', 'DESC')
            ->get()->getResultArray();
    }

    public function createPolicy(array $data): array
    {
        if (empty($data['policy_name'])) throw new RuntimeException('กรุณาระบุชื่อนโยบาย');
        if (empty($data['fee_formula_id'])) throw new RuntimeException('กรุณาเลือกสูตร');
        if (!empty($data['effective_from']) && !empty($data['effective_to']) && $data['effective_from'] > $data['effective_to']) {
            throw new RuntimeException('วันเริ่มต้นต้องไม่เกินวันสิ้นสุด');
        }

        // Validate expressions ถ้าใส่มา
        $overrideExpr = isset($data['override_expression']) ? trim((string) $data['override_expression']) : '';
        $conditionExpr = isset($data['condition_expression']) ? trim((string) $data['condition_expression']) : '';

        if ($overrideExpr !== '') {
            $check = $this->evaluator->validate($overrideExpr);
            if (!$check['valid']) {
                throw new RuntimeException('สูตร override ไม่ถูกต้อง: ' . $check['error']);
            }
        }
        if ($conditionExpr !== '') {
            $check = $this->evaluator->validateBoolean($conditionExpr);
            if (!$check['valid']) {
                throw new RuntimeException('เงื่อนไขไม่ถูกต้อง: ' . $check['error']);
            }
        }

        $now = date('Y-m-d H:i:s');
        $this->db->table('fee_rate_policies')->insert([
            'fee_formula_id'       => (int) $data['fee_formula_id'],
            'policy_name'          => trim($data['policy_name']),
            'override_rate'        => (float) ($data['override_rate'] ?? 0),
            'override_buyer_share' => isset($data['override_buyer_share']) ? (float) $data['override_buyer_share'] : null,
            'override_expression'  => $overrideExpr !== '' ? $overrideExpr : null,
            'condition_expression' => $conditionExpr !== '' ? $conditionExpr : null,
            'conditions'           => json_encode($data['conditions'] ?? new \stdClass(), JSON_UNESCAPED_UNICODE),
            'effective_from'       => $data['effective_from'],
            'effective_to'         => $data['effective_to'],
            'is_active'            => !empty($data['is_active']) ? 1 : 0,
            'priority'             => (int) ($data['priority'] ?? 0),
            'created_at'           => $now,
            'updated_at'           => $now,
        ]);

        return $this->db->table('fee_rate_policies')->where('id', $this->db->insertID())->get()->getRowArray();
    }

    public function updatePolicy(int $id, array $data): array
    {
        $existing = $this->db->table('fee_rate_policies')->where('id', $id)->get()->getRowArray();
        if (!$existing) throw new RuntimeException('ไม่พบนโยบาย');

        // Validate expressions ถ้าใส่มา
        $overrideExpr = array_key_exists('override_expression', $data)
            ? trim((string) ($data['override_expression'] ?? ''))
            : ($existing['override_expression'] ?? '');
        $conditionExpr = array_key_exists('condition_expression', $data)
            ? trim((string) ($data['condition_expression'] ?? ''))
            : ($existing['condition_expression'] ?? '');

        if ($overrideExpr !== '') {
            $check = $this->evaluator->validate($overrideExpr);
            if (!$check['valid']) {
                throw new RuntimeException('สูตร override ไม่ถูกต้อง: ' . $check['error']);
            }
        }
        if ($conditionExpr !== '') {
            $check = $this->evaluator->validateBoolean($conditionExpr);
            if (!$check['valid']) {
                throw new RuntimeException('เงื่อนไขไม่ถูกต้อง: ' . $check['error']);
            }
        }

        $this->db->table('fee_rate_policies')->where('id', $id)->update([
            'policy_name'          => trim($data['policy_name'] ?? $existing['policy_name']),
            'override_rate'        => (float) ($data['override_rate'] ?? $existing['override_rate']),
            'override_buyer_share' => array_key_exists('override_buyer_share', $data) ? (isset($data['override_buyer_share']) ? (float) $data['override_buyer_share'] : null) : $existing['override_buyer_share'],
            'override_expression'  => $overrideExpr !== '' ? $overrideExpr : null,
            'condition_expression' => $conditionExpr !== '' ? $conditionExpr : null,
            'conditions'           => isset($data['conditions']) ? json_encode($data['conditions'], JSON_UNESCAPED_UNICODE) : $existing['conditions'],
            'effective_from'       => $data['effective_from'] ?? $existing['effective_from'],
            'effective_to'         => $data['effective_to'] ?? $existing['effective_to'],
            'is_active'            => isset($data['is_active']) ? ($data['is_active'] ? 1 : 0) : $existing['is_active'],
            'priority'             => (int) ($data['priority'] ?? $existing['priority']),
            'updated_at'           => date('Y-m-d H:i:s'),
        ]);

        return $this->db->table('fee_rate_policies')->where('id', $id)->get()->getRowArray();
    }

    public function deletePolicy(int $id): void
    {
        if (!$this->db->table('fee_rate_policies')->where('id', $id)->countAllResults()) {
            throw new RuntimeException('ไม่พบนโยบาย');
        }
        $this->db->table('fee_rate_policies')->where('id', $id)->delete();
    }

    public function togglePolicy(int $id): array
    {
        $row = $this->db->table('fee_rate_policies')->where('id', $id)->get()->getRowArray();
        if (!$row) throw new RuntimeException('ไม่พบนโยบาย');
        $newActive = $row['is_active'] ? 0 : 1;
        $this->db->table('fee_rate_policies')->where('id', $id)->update(['is_active' => $newActive, 'updated_at' => date('Y-m-d H:i:s')]);
        $row['is_active'] = $newActive;
        return $row;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Test (single unit)
    // ═══════════════════════════════════════════════════════════════════════

    public function testCalculation(array $params): array
    {
        $saleDate = $params['sale_date'] ?? date('Y-m-d');
        $manualInputs = $params['manual_inputs'] ?? [];
        $contractPrice = isset($params['contract_price']) ? (float) $params['contract_price'] : null;

        // ดึงข้อมูลยูนิต + project (สำหรับ expression vars)
        if (($params['mode'] ?? 'unit') === 'unit') {
            $unit = $this->db->table('project_units pu')
                ->select('pu.*, p.project_type, p.common_fee_rate, p.electric_meter_fee, p.water_meter_fee, p.pool_budget_amount')
                ->join('projects p', 'p.id = pu.project_id', 'left')
                ->where('pu.id', $params['unit_id'] ?? 0)->get()->getRowArray();
            if (!$unit) throw new RuntimeException('ไม่พบยูนิต');
            $unitData = [
                'base_price'         => (float) $unit['base_price'],
                'unit_cost'          => (float) $unit['unit_cost'],
                'appraisal_price'    => (float) ($unit['appraisal_price'] ?? 0),
                'land_area_sqw'      => (float) ($unit['land_area_sqw'] ?? 0),
                'area_sqm'           => (float) ($unit['area_sqm'] ?? 0),
                'standard_budget'    => (float) ($unit['standard_budget'] ?? 0),
                'project_type'       => $unit['project_type'] ?? '',
                'common_fee_rate'    => (float) ($unit['common_fee_rate'] ?? 0),
                'electric_meter_fee' => (float) ($unit['electric_meter_fee'] ?? 0),
                'water_meter_fee'    => (float) ($unit['water_meter_fee'] ?? 0),
                'pool_budget_amount' => (float) ($unit['pool_budget_amount'] ?? 0),
            ];
        } else {
            $md = $params['manual_data'] ?? [];
            $unitData = [
                'base_price'         => (float) ($md['base_price'] ?? 0),
                'unit_cost'          => (float) ($md['unit_cost'] ?? 0),
                'appraisal_price'    => (float) ($md['appraisal_price'] ?? 0),
                'land_area_sqw'      => (float) ($md['land_area_sqw'] ?? 0),
                'area_sqm'           => (float) ($md['area_sqm'] ?? 0),
                'standard_budget'    => (float) ($md['standard_budget'] ?? 0),
                'project_type'       => $md['project_type'] ?? '',
                'common_fee_rate'    => (float) ($md['common_fee_rate'] ?? 0),
                'electric_meter_fee' => (float) ($md['electric_meter_fee'] ?? 0),
                'water_meter_fee'    => (float) ($md['water_meter_fee'] ?? 0),
                'pool_budget_amount' => (float) ($md['pool_budget_amount'] ?? 0),
            ];
        }

        // ดึงสูตรทั้งหมด
        $formulas = $this->db->table('fee_formulas f')
            ->select('f.*, p.name AS item_name, p.code AS item_code, p.category, p.max_value AS item_max_value')
            ->join('promotion_item_master p', 'p.id = f.promotion_item_id')
            ->get()->getResultArray();

        $results = [];
        $totalCalculated = 0;
        $totalNormal = 0;

        foreach ($formulas as $formula) {
            $r = $this->calculateOne($formula, $unitData, $saleDate, $manualInputs, $contractPrice);
            $results[] = $r;
            $totalCalculated += $r['calculated_value'];
            $totalNormal += $r['formula']['normal_value'];
        }

        return [
            'results'         => $results,
            'total_calculated' => $totalCalculated,
            'total_normal'     => $totalNormal,
            'total_savings'    => $totalNormal - $totalCalculated,
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Test Batch
    // ═══════════════════════════════════════════════════════════════════════

    public function testBatch(int $formulaId, string $saleDate, int $projectId): array
    {
        $formula = $this->db->table('fee_formulas f')
            ->select('f.*, p.name AS item_name, p.code AS item_code, p.category, p.max_value AS item_max_value')
            ->join('promotion_item_master p', 'p.id = f.promotion_item_id')
            ->where('f.id', $formulaId)->get()->getRowArray();

        if (!$formula) throw new RuntimeException('ไม่พบสูตร');

        $units = $this->db->table('project_units pu')
            ->select('pu.*, pr.project_type')
            ->join('projects pr', 'pr.id = pu.project_id', 'left')
            ->where('pu.project_id', $projectId)
            ->whereIn('pu.status', ['available', 'reserved'])
            ->limit(500)
            ->get()->getResultArray();

        $results = [];
        foreach ($units as $u) {
            $unitData = [
                'base_price'      => (float) $u['base_price'],
                'appraisal_price' => (float) ($u['appraisal_price'] ?? 0),
                'project_type'    => $u['project_type'] ?? '',
            ];
            $r = $this->calculateOne($formula, $unitData, $saleDate, []);
            $results[] = [
                'unit_code'        => $u['unit_code'],
                'unit_id'          => (int) $u['id'],
                'base_amount'      => $r['formula']['base_amount'],
                'rate'             => $r['effective_rate'],
                'buyer_share'      => $r['effective_buyer_share'],
                'calculated_value' => $r['calculated_value'],
                'matched_policy'   => $r['applied_policy'] ? $r['applied_policy']['policy_name'] : null,
            ];
        }

        return ['results' => $results];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Private: Calculate one formula for one unit
    // ═══════════════════════════════════════════════════════════════════════

    private function calculateOne(array $formula, array $unitData, string $saleDate, array $manualInputs, ?float $contractPrice = null): array
    {
        // Determine base_amount
        $baseAmount = 0;
        $isExpression = false;
        $expressionResult = null;
        $expressionData = null; // รายละเอียดสำหรับ expression mode

        switch ($formula['base_field']) {
            case 'appraisal_price': $baseAmount = $unitData['appraisal_price']; break;
            case 'base_price':      $baseAmount = $unitData['base_price']; break;
            case 'net_price':       $baseAmount = $unitData['net_price'] ?? $unitData['base_price']; break;
            case 'manual_input':    $baseAmount = (float) ($manualInputs[$formula['item_code']] ?? 0); break;
            case 'expression':
                $isExpression = true;
                $expr = (string) ($formula['formula_expression'] ?? '');
                $context = [
                    'common_fee_rate'    => $unitData['common_fee_rate'] ?? 0,
                    'electric_meter_fee' => $unitData['electric_meter_fee'] ?? 0,
                    'water_meter_fee'    => $unitData['water_meter_fee'] ?? 0,
                    'pool_budget_amount' => $unitData['pool_budget_amount'] ?? 0,
                    'base_price'         => $unitData['base_price'] ?? 0,
                    'unit_cost'          => $unitData['unit_cost'] ?? 0,
                    'appraisal_price'    => $unitData['appraisal_price'] ?? 0,
                    'land_area_sqw'      => $unitData['land_area_sqw'] ?? 0,
                    'area_sqm'           => $unitData['area_sqm'] ?? 0,
                    'standard_budget'    => $unitData['standard_budget'] ?? 0,
                    'contract_price'     => $contractPrice ?? 0,
                    'net_price'          => $unitData['net_price'] ?? $unitData['base_price'] ?? 0,
                ];
                try {
                    $expressionResult = $this->evaluator->evaluate($expr, $context);
                    $baseAmount = $expressionResult;
                    $expressionData = [
                        'expression'        => $expr,
                        'substituted'       => $this->evaluator->substitute($expr, $context),
                        'variables_used'    => $this->evaluator->getUsedVariablesWithValues($expr, $context),
                        'error'             => null,
                    ];
                } catch (\Throwable $e) {
                    $expressionResult = null;
                    $baseAmount = 0;
                    $expressionData = [
                        'expression'        => $expr,
                        'substituted'       => null,
                        'variables_used'    => $this->evaluator->getUsedVariablesWithValues($expr, $context),
                        'error'             => $e->getMessage(),
                    ];
                }
                break;
        }

        $defaultRate  = (float) $formula['default_rate'];
        $buyerShare   = (float) $formula['buyer_share'];
        // expression mode: ผลลัพธ์ของสูตรเป็น final value — normal_value = expressionResult
        $normalValue  = $isExpression ? ($expressionResult ?? 0) : ($baseAmount * $defaultRate * $buyerShare);

        // Match policies
        $policies = $this->db->table('fee_rate_policies')
            ->where('fee_formula_id', $formula['id'])
            ->where('is_active', 1)
            ->where('effective_from <=', $saleDate)
            ->where('effective_to >=', $saleDate)
            ->orderBy('priority', 'DESC')
            ->orderBy('effective_from', 'DESC')
            ->get()->getResultArray();

        $appliedPolicy = null;
        $allChecked = [];

        foreach ($policies as $policy) {
            $conditions = json_decode($policy['conditions'] ?? '{}', true) ?: [];
            $matched = true;
            $conditionResults = [];

            // max_base_price
            if (isset($conditions['max_base_price'])) {
                $passed = $unitData['base_price'] <= (float) $conditions['max_base_price'];
                $conditionResults[] = [
                    'condition' => 'max_base_price',
                    'threshold' => $conditions['max_base_price'],
                    'actual'    => $unitData['base_price'],
                    'passed'    => $passed,
                ];
                if (!$passed) $matched = false;
            }

            // project_types
            if (isset($conditions['project_types']) && is_array($conditions['project_types'])) {
                $passed = in_array($unitData['project_type'], $conditions['project_types'], true);
                $conditionResults[] = [
                    'condition' => 'project_types',
                    'threshold' => $conditions['project_types'],
                    'actual'    => $unitData['project_type'],
                    'passed'    => $passed,
                ];
                if (!$passed) $matched = false;
            }

            $allChecked[] = [
                'id'          => (int) $policy['id'],
                'policy_name' => $policy['policy_name'],
                'matched'     => $matched,
                'reason'      => $matched ? 'ตรงทุกเงื่อนไข' : 'ไม่ผ่านเงื่อนไข',
            ];

            if ($matched && !$appliedPolicy) {
                $appliedPolicy = [
                    'id'                   => (int) $policy['id'],
                    'policy_name'          => $policy['policy_name'],
                    'override_rate'        => (float) $policy['override_rate'],
                    'override_buyer_share' => $policy['override_buyer_share'] !== null ? (float) $policy['override_buyer_share'] : null,
                    'conditions_met'       => $conditionResults,
                ];
            }
        }

        // Effective rate
        $effectiveRate = $appliedPolicy ? $appliedPolicy['override_rate'] : $defaultRate;
        $effectiveBuyerShare = $appliedPolicy && $appliedPolicy['override_buyer_share'] !== null
            ? $appliedPolicy['override_buyer_share']
            : $buyerShare;

        // expression mode: ใช้ผลของ expression เป็น final value (ไม่คูณ rate/share อีก)
        $calculatedValue = $isExpression
            ? ($expressionResult ?? 0)
            : ($baseAmount * $effectiveRate * $effectiveBuyerShare);

        // Cap at max_value
        $maxValue = $formula['item_max_value'] ?? null;
        if ($maxValue !== null && $calculatedValue > (float) $maxValue) {
            $calculatedValue = (float) $maxValue;
        }

        return [
            'promotion_item_id'   => (int) $formula['promotion_item_id'],
            'promotion_item_name' => $formula['item_name'],
            'category'            => $formula['category'],
            'formula'             => [
                'base_field'         => $formula['base_field'],
                'base_amount'        => $baseAmount,
                'default_rate'       => $defaultRate,
                'buyer_share'        => $buyerShare,
                'normal_value'       => $normalValue,
                'formula_expression' => $formula['formula_expression'] ?? null,
            ],
            'expression_detail'     => $expressionData,
            'applied_policy'        => $appliedPolicy,
            'effective_rate'        => $effectiveRate,
            'effective_buyer_share' => $effectiveBuyerShare,
            'calculated_value'      => round($calculatedValue, 2),
            'savings'               => round($normalValue - $calculatedValue, 2),
            'all_policies_checked'  => $allChecked,
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // calculateForSalesEntry — reusable สำหรับ Sales Entry
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * คำนวณ calculated value สำหรับ Sales Entry
     *
     * สูตร: calculated_value = base_amount × effective_rate × buyer_share
     * - Policy matching: active + date range + conditions → highest priority
     * - Fallback: formula defaults
     * - Cap ที่ max_value ถ้ามี
     *
     * @return array { calculated, calculated_value?, base_amount?, effective_rate?,
     *                 effective_buyer_share?, matched_policy?, formula_label?,
     *                 capped?, needs_input?, input_label?, reason? }
     */
    public function calculateForSalesEntry(
        int    $promotionItemId,
        array  $unitData,
        string $saleDate,
        ?float $netPrice = null,
        ?float $manualInput = null,
        ?float $contractPrice = null
    ): array {
        // 1. Load formula
        $formula = $this->db->table('fee_formulas')
            ->where('promotion_item_id', $promotionItemId)
            ->get()->getRowArray();

        if (!$formula) {
            return ['calculated' => false, 'reason' => 'ไม่พบสูตรคำนวณ'];
        }

        // Load promotion item สำหรับ max_value + name
        $item = $this->db->table('promotion_item_master')
            ->where('id', $promotionItemId)->get()->getRowArray();

        // 2. Determine base_amount
        $baseAmount = null;
        $baseField  = $formula['base_field'];
        $baseLabel  = '';

        switch ($baseField) {
            case 'appraisal_price':
                $baseLabel = 'ราคาประเมิน';
                $val = $unitData['appraisal_price'] ?? null;
                if ($val === null || $val == 0) {
                    return [
                        'calculated'  => false,
                        'reason'      => 'ไม่มีราคาประเมิน',
                        'needs_field' => 'appraisal_price',
                    ];
                }
                $baseAmount = (float) $val;
                break;

            case 'base_price':
                $baseLabel  = 'ราคาขาย';
                $baseAmount = (float) ($unitData['base_price'] ?? 0);
                break;

            case 'net_price':
                $baseLabel = 'ราคาสุทธิ';
                if ($netPrice === null) {
                    return ['calculated' => false, 'reason' => 'ต้องการ net_price'];
                }
                $baseAmount = $netPrice;
                break;

            case 'manual_input':
                $baseLabel = $formula['manual_input_label'] ?? 'กรอกเอง';
                if ($manualInput === null) {
                    return [
                        'calculated'  => false,
                        'needs_input' => true,
                        'input_label' => $formula['manual_input_label'] ?? 'กรอกค่าฐาน',
                    ];
                }
                $baseAmount = $manualInput;
                break;

            case 'expression':
                $baseLabel = 'นิพจน์';
                $expr = (string) ($formula['formula_expression'] ?? '');
                $usedVars = $this->evaluator->extractVariables($expr);
                $needsContract = in_array('contract_price', $usedVars, true);

                if ($needsContract && ($contractPrice === null || $contractPrice <= 0)) {
                    return [
                        'calculated'  => false,
                        'needs_input' => true,
                        'reason'      => 'รอกรอกราคาหน้าสัญญา',
                        'input_label' => 'ราคาหน้าสัญญา',
                    ];
                }

                $context = [
                    'common_fee_rate'    => (float) ($unitData['common_fee_rate'] ?? 0),
                    'electric_meter_fee' => (float) ($unitData['electric_meter_fee'] ?? 0),
                    'water_meter_fee'    => (float) ($unitData['water_meter_fee'] ?? 0),
                    'pool_budget_amount' => (float) ($unitData['pool_budget_amount'] ?? 0),
                    'project_type'       => (string) ($unitData['project_type'] ?? ''),
                    'base_price'         => (float) ($unitData['base_price'] ?? 0),
                    'unit_cost'          => (float) ($unitData['unit_cost'] ?? 0),
                    'appraisal_price'    => (float) ($unitData['appraisal_price'] ?? 0),
                    'land_area_sqw'      => (float) ($unitData['land_area_sqw'] ?? 0),
                    'area_sqm'           => (float) ($unitData['area_sqm'] ?? 0),
                    'standard_budget'    => (float) ($unitData['standard_budget'] ?? 0),
                    'contract_price'     => (float) ($contractPrice ?? 0),
                    'net_price'          => $netPrice !== null ? (float) $netPrice : (float) ($unitData['base_price'] ?? 0),
                ];
                try {
                    $exprResult = $this->evaluator->evaluate($expr, $context);
                } catch (\Throwable $e) {
                    return ['calculated' => false, 'reason' => 'คำนวณสูตรไม่สำเร็จ: ' . $e->getMessage()];
                }

                // ตรวจ policies — รองรับ condition_expression + override_expression
                $matchedPolicyExpr = $this->matchExpressionPolicy($formula['id'], $saleDate, $context);
                if ($matchedPolicyExpr && !empty($matchedPolicyExpr['override_expression'])) {
                    try {
                        $exprResult = $this->evaluator->evaluate($matchedPolicyExpr['override_expression'], $context);
                    } catch (\Throwable $e) {
                        // ใช้ผลเดิมถ้า override error
                    }
                }

                $maxValueExpr = $item['max_value'] ?? null;
                $cappedExpr = false;
                if ($maxValueExpr !== null && $exprResult > (float) $maxValueExpr) {
                    $exprResult = (float) $maxValueExpr;
                    $cappedExpr = true;
                }
                return [
                    'calculated'            => true,
                    'calculated_value'      => round($exprResult, 2),
                    'base_amount'           => 0,
                    'matched_policy'        => $matchedPolicyExpr ? [
                        'id'          => (int) $matchedPolicyExpr['id'],
                        'policy_name' => $matchedPolicyExpr['policy_name'],
                    ] : null,
                    'effective_rate'        => 1,
                    'effective_buyer_share' => 1,
                    'matched_policy'        => null,
                    'formula_label'         => $expr . ' = ' . number_format($exprResult, 2, '.', ','),
                    'capped'                => $cappedExpr,
                    'needs_input'           => false,
                    'input_label'           => null,
                ];
        }

        // 3. Match policy
        $defaultRate  = (float) $formula['default_rate'];
        $buyerShare   = (float) $formula['buyer_share'];

        $policies = $this->db->table('fee_rate_policies')
            ->where('fee_formula_id', $formula['id'])
            ->where('is_active', 1)
            ->where('effective_from <=', $saleDate)
            ->where('effective_to >=', $saleDate)
            ->orderBy('priority', 'DESC')
            ->orderBy('effective_from', 'DESC')
            ->get()->getResultArray();

        $matchedPolicy = null;
        foreach ($policies as $policy) {
            $conditions = json_decode($policy['conditions'] ?? '{}', true) ?: [];
            $matched = true;

            if (isset($conditions['max_base_price'])) {
                if (($unitData['base_price'] ?? 0) > (float) $conditions['max_base_price']) {
                    $matched = false;
                }
            }
            if (isset($conditions['project_types']) && is_array($conditions['project_types'])) {
                if (!in_array($unitData['project_type'] ?? '', $conditions['project_types'], true)) {
                    $matched = false;
                }
            }

            if ($matched) {
                $matchedPolicy = $policy;
                break;
            }
        }

        // 4. Effective rate
        $effectiveRate = $matchedPolicy ? (float) $matchedPolicy['override_rate'] : $defaultRate;
        $effectiveBuyerShare = ($matchedPolicy && $matchedPolicy['override_buyer_share'] !== null)
            ? (float) $matchedPolicy['override_buyer_share']
            : $buyerShare;

        $calculatedValue = $baseAmount * $effectiveRate * $effectiveBuyerShare;

        // 5. Cap at max_value
        $capped   = false;
        $maxValue = $item['max_value'] ?? null;
        if ($maxValue !== null && $calculatedValue > (float) $maxValue) {
            $calculatedValue = (float) $maxValue;
            $capped = true;
        }

        $calculatedValue = round($calculatedValue, 2);

        // 6. Build formula_label
        $ratePercent = round($effectiveRate * 100, 2);
        $sharePercent = round($effectiveBuyerShare * 100, 0);
        $baseFormatted = number_format($baseAmount, 0, '.', ',');
        $policyNamePart = $matchedPolicy ? " ({$matchedPolicy['policy_name']})" : '';
        $formulaLabel = "{$baseLabel} {$baseFormatted} × {$ratePercent}% × {$sharePercent}%{$policyNamePart}";

        return [
            'calculated'            => true,
            'calculated_value'      => $calculatedValue,
            'base_amount'           => $baseAmount,
            'effective_rate'        => $effectiveRate,
            'effective_buyer_share' => $effectiveBuyerShare,
            'matched_policy'        => $matchedPolicy ? [
                'id'          => (int) $matchedPolicy['id'],
                'policy_name' => $matchedPolicy['policy_name'],
            ] : null,
            'formula_label'         => $formulaLabel,
            'capped'                => $capped,
            'needs_input'           => false,
            'input_label'           => $baseField === 'manual_input' ? ($formula['manual_input_label'] ?? null) : null,
        ];
    }

    /**
     * Match policy ที่ใช้ condition_expression (สำหรับ expression-mode formula)
     * คืน policy แรกที่ match ตาม priority DESC
     */
    private function matchExpressionPolicy(int $formulaId, string $saleDate, array $context): ?array
    {
        $policies = $this->db->table('fee_rate_policies')
            ->where('fee_formula_id', $formulaId)
            ->where('is_active', 1)
            ->where('effective_from <=', $saleDate)
            ->where('effective_to >=', $saleDate)
            ->orderBy('priority', 'DESC')
            ->orderBy('effective_from', 'DESC')
            ->get()->getResultArray();

        foreach ($policies as $policy) {
            $matched = true;
            // Expression-based condition (ใช้ก่อน — fallback legacy ถ้าไม่มี)
            if (!empty($policy['condition_expression'])) {
                try {
                    $matched = $this->evaluator->evaluateBoolean($policy['condition_expression'], $context);
                } catch (\Throwable $e) {
                    $matched = false;
                }
            } else {
                // Legacy JSON conditions (สำหรับ backward compat)
                $conditions = json_decode($policy['conditions'] ?? '{}', true) ?: [];
                if (isset($conditions['max_base_price'])) {
                    if (($context['base_price'] ?? 0) > (float) $conditions['max_base_price']) {
                        $matched = false;
                    }
                }
                if (isset($conditions['project_types']) && is_array($conditions['project_types'])) {
                    if (!in_array($context['project_type'] ?? '', $conditions['project_types'], true)) {
                        $matched = false;
                    }
                }
            }

            if ($matched) return $policy;
        }
        return null;
    }
}
