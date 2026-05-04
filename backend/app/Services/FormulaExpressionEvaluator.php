<?php

namespace App\Services;

use Symfony\Component\ExpressionLanguage\ExpressionLanguage;
use Symfony\Component\ExpressionLanguage\SyntaxError;
use RuntimeException;

/**
 * Safe arithmetic expression evaluator สำหรับ fee formula
 *
 * อนุญาตเฉพาะ: ตัวแปรที่ inject เข้าไป + ตัวเลข + + - * / ( ) +
 *              fn() พื้นฐานที่ whitelist (max, min, round, abs, floor, ceil)
 * ไม่อนุญาต: function calls อื่น, property access, method calls, eval(), system()
 */
class FormulaExpressionEvaluator
{
    /** ตัวแปรทั้งหมดที่รองรับ พร้อม label ภาษาไทย + scope + type */
    public const VARIABLES = [
        // Project-level (จากตาราง projects)
        'common_fee_rate'    => ['label' => 'อัตราค่าส่วนกลาง',     'scope' => 'project',     'unit' => 'บาท/ตร.ม./เดือน', 'type' => 'numeric'],
        'electric_meter_fee' => ['label' => 'ค่าติดตั้งมิเตอร์ไฟฟ้า', 'scope' => 'project',     'unit' => 'บาท',            'type' => 'numeric'],
        'water_meter_fee'    => ['label' => 'ค่าติดตั้งมิเตอร์ประปา',  'scope' => 'project',     'unit' => 'บาท',            'type' => 'numeric'],
        'pool_budget_amount' => ['label' => 'งบ Pool',                'scope' => 'project',     'unit' => 'บาท',            'type' => 'numeric'],
        'project_type'       => ['label' => 'ประเภทโครงการ',          'scope' => 'project',     'unit' => '',                'type' => 'string'],

        // Unit-level (จากตาราง project_units)
        'base_price'      => ['label' => 'ราคาขาย',        'scope' => 'unit',        'unit' => 'บาท',     'type' => 'numeric'],
        'unit_cost'       => ['label' => 'ต้นทุนยูนิต',     'scope' => 'unit',        'unit' => 'บาท',     'type' => 'numeric'],
        'appraisal_price' => ['label' => 'ราคาประเมิน',     'scope' => 'unit',        'unit' => 'บาท',     'type' => 'numeric'],
        'land_area_sqw'   => ['label' => 'ขนาดที่ดิน',       'scope' => 'unit',        'unit' => 'ตร.ว.',  'type' => 'numeric'],
        'area_sqm'        => ['label' => 'พื้นที่ใช้สอย',    'scope' => 'unit',        'unit' => 'ตร.ม.',  'type' => 'numeric'],
        'standard_budget' => ['label' => 'งบยูนิต',         'scope' => 'unit',        'unit' => 'บาท',     'type' => 'numeric'],

        // Transaction-level (เฉพาะตอนบันทึกขาย / tester ต้อง prompt)
        'contract_price' => ['label' => 'ราคาหน้าสัญญา', 'scope' => 'transaction', 'unit' => 'บาท', 'type' => 'numeric'],
        'net_price'      => ['label' => 'ราคาสุทธิ',       'scope' => 'transaction', 'unit' => 'บาท', 'type' => 'numeric'],
    ];

    /** ฟังก์ชันคณิตศาสตร์ที่อนุญาต (whitelist) */
    private const ALLOWED_FUNCTIONS = ['max', 'min', 'round', 'abs', 'floor', 'ceil'];

    private ExpressionLanguage $expr;

    public function __construct()
    {
        $this->expr = new ExpressionLanguage();
        $this->registerSafeFunctions();
    }

    private function registerSafeFunctions(): void
    {
        // round(x, precision = 0)
        $this->expr->register('round',
            fn($x, $p = 0) => sprintf('round(%s, %s)', $x, $p),
            fn($args, $x, $p = 0) => round((float) $x, (int) $p)
        );
        // max, min: รับหลายตัวแปร
        $this->expr->register('max',
            fn(...$args) => 'max(' . implode(',', $args) . ')',
            fn($_, ...$args) => max(...array_map('floatval', $args))
        );
        $this->expr->register('min',
            fn(...$args) => 'min(' . implode(',', $args) . ')',
            fn($_, ...$args) => min(...array_map('floatval', $args))
        );
        $this->expr->register('abs',
            fn($x) => "abs({$x})",
            fn($_, $x) => abs((float) $x)
        );
        $this->expr->register('floor',
            fn($x) => "floor({$x})",
            fn($_, $x) => floor((float) $x)
        );
        $this->expr->register('ceil',
            fn($x) => "ceil({$x})",
            fn($_, $x) => ceil((float) $x)
        );
    }

    /**
     * ตรวจสอบ syntax + ตัวแปรที่ใช้ในสูตร
     *
     * @return array { valid: bool, error?: string, used_variables?: string[], unknown_variables?: string[] }
     */
    /** ลบ string literal ออกจาก expression เพื่อหา identifier (กัน "condo" โดน match ผิด) */
    private function stripStringLiterals(string $expression): string
    {
        // ลบ "..." และ '...' (รองรับ escape \\)
        $stripped = preg_replace('/"(?:[^"\\\\]|\\\\.)*"/', '', $expression);
        $stripped = preg_replace("/'(?:[^'\\\\]|\\\\.)*'/", '', $stripped);
        return $stripped ?? $expression;
    }

    public function validate(string $expression): array
    {
        $expression = trim($expression);
        if ($expression === '') {
            return ['valid' => false, 'error' => 'สูตรว่างเปล่า'];
        }

        // หา identifier ทั้งหมดในสูตร (ตัวแปร / ฟังก์ชัน) — ตัด string literal ออกก่อน
        $forCheck = $this->stripStringLiterals($expression);
        preg_match_all('/[a-zA-Z_][a-zA-Z0-9_]*/', $forCheck, $matches);
        $identifiers = array_unique($matches[0]);

        $varKeys = array_keys(self::VARIABLES);
        $usedVars = [];
        $unknown = [];

        foreach ($identifiers as $id) {
            if (in_array($id, self::ALLOWED_FUNCTIONS, true)) continue;
            if (in_array($id, $varKeys, true)) {
                $usedVars[] = $id;
            } else {
                $unknown[] = $id;
            }
        }

        if (!empty($unknown)) {
            return [
                'valid' => false,
                'error' => 'พบตัวแปร/ฟังก์ชันที่ไม่รู้จัก: ' . implode(', ', $unknown),
                'unknown_variables' => $unknown,
            ];
        }

        // ลอง parse syntax กับ dummy values
        try {
            $dummyContext = array_fill_keys($varKeys, 1.0);
            $this->expr->evaluate($expression, $dummyContext);
        } catch (SyntaxError $e) {
            return ['valid' => false, 'error' => 'Syntax error: ' . $e->getMessage()];
        } catch (\Throwable $e) {
            return ['valid' => false, 'error' => 'ไม่สามารถ parse สูตรได้: ' . $e->getMessage()];
        }

        return [
            'valid' => true,
            'used_variables' => array_values($usedVars),
        ];
    }

    /**
     * สร้าง full context — เติมค่า default ตาม type ของตัวแปร
     */
    private function buildFullContext(array $context): array
    {
        $fullContext = [];
        foreach (self::VARIABLES as $key => $meta) {
            $type = $meta['type'] ?? 'numeric';
            if ($type === 'string') {
                $fullContext[$key] = isset($context[$key]) ? (string) $context[$key] : '';
            } else {
                $fullContext[$key] = isset($context[$key]) ? (float) $context[$key] : 0.0;
            }
        }
        return $fullContext;
    }

    /**
     * ประเมินค่า expression (numeric)
     *
     * @param string $expression สูตร
     * @param array  $context    คู่ตัวแปร => ค่า
     * @return float ผลลัพธ์
     * @throws RuntimeException ถ้า evaluate ไม่ได้
     */
    public function evaluate(string $expression, array $context): float
    {
        $expression = trim($expression);
        if ($expression === '') {
            throw new RuntimeException('สูตรว่างเปล่า');
        }

        $fullContext = $this->buildFullContext($context);

        try {
            $result = $this->expr->evaluate($expression, $fullContext);
        } catch (\Throwable $e) {
            throw new RuntimeException('คำนวณสูตรไม่สำเร็จ: ' . $e->getMessage());
        }

        if (!is_numeric($result)) {
            throw new RuntimeException('ผลลัพธ์ไม่ใช่ตัวเลข');
        }

        if (!is_finite((float) $result)) {
            throw new RuntimeException('ผลลัพธ์ไม่ถูกต้อง (อาจเกิดจากการหารด้วย 0)');
        }

        return (float) $result;
    }

    /**
     * ประเมินค่า boolean expression (สำหรับเงื่อนไข policy)
     * รองรับ: > < >= <= == != and or not in
     *
     * @return bool
     * @throws RuntimeException ถ้า evaluate ไม่ได้
     */
    public function evaluateBoolean(string $expression, array $context): bool
    {
        $expression = trim($expression);
        if ($expression === '') {
            throw new RuntimeException('เงื่อนไขว่างเปล่า');
        }

        $fullContext = $this->buildFullContext($context);

        try {
            $result = $this->expr->evaluate($expression, $fullContext);
        } catch (\Throwable $e) {
            throw new RuntimeException('ประเมินเงื่อนไขไม่สำเร็จ: ' . $e->getMessage());
        }

        return (bool) $result;
    }

    /**
     * ตรวจ syntax สำหรับ boolean expression
     */
    public function validateBoolean(string $expression): array
    {
        $expression = trim($expression);
        if ($expression === '') {
            return ['valid' => false, 'error' => 'เงื่อนไขว่างเปล่า'];
        }

        // ตัด string literal ออกก่อนหา identifier
        $forCheck = $this->stripStringLiterals($expression);
        preg_match_all('/[a-zA-Z_][a-zA-Z0-9_]*/', $forCheck, $matches);
        $identifiers = array_unique($matches[0]);

        $varKeys = array_keys(self::VARIABLES);
        // อนุญาต boolean keywords + comparison/logical
        $reserved = ['true', 'false', 'and', 'or', 'not', 'in'];
        $usedVars = [];
        $unknown = [];

        foreach ($identifiers as $id) {
            if (in_array($id, self::ALLOWED_FUNCTIONS, true)) continue;
            if (in_array(strtolower($id), $reserved, true)) continue;
            if (in_array($id, $varKeys, true)) {
                $usedVars[] = $id;
            } else {
                $unknown[] = $id;
            }
        }

        if (!empty($unknown)) {
            return [
                'valid' => false,
                'error' => 'พบตัวแปร/ฟังก์ชันที่ไม่รู้จัก: ' . implode(', ', $unknown),
                'unknown_variables' => $unknown,
            ];
        }

        try {
            $dummy = [];
            foreach (self::VARIABLES as $key => $meta) {
                $dummy[$key] = ($meta['type'] ?? 'numeric') === 'string' ? 'sample' : 1.0;
            }
            $this->expr->evaluate($expression, $dummy);
        } catch (SyntaxError $e) {
            return ['valid' => false, 'error' => 'Syntax error: ' . $e->getMessage()];
        } catch (\Throwable $e) {
            return ['valid' => false, 'error' => 'Parse error: ' . $e->getMessage()];
        }

        return ['valid' => true, 'used_variables' => array_values($usedVars)];
    }

    /**
     * คืนรายชื่อตัวแปรที่ใช้ในสูตร (สำหรับ frontend แสดง required inputs)
     */
    public function extractVariables(string $expression): array
    {
        $result = $this->validate($expression);
        return $result['used_variables'] ?? [];
    }

    /**
     * แทนค่าตัวแปรในสูตรด้วยค่าจริง — ใช้แสดงให้ผู้ใช้เข้าใจการคำนวณ
     * เช่น "contract_price * 0.02" → "3,500,000 * 0.02"
     *
     * @param string $expression สูตรต้นฉบับ
     * @param array  $context    คู่ตัวแปร => ค่า
     * @return string สูตรหลังแทนค่า (formatted)
     */
    public function substitute(string $expression, array $context): string
    {
        $varKeys = array_keys(self::VARIABLES);
        // เรียงจากชื่อยาวก่อน — กัน substring overlap (เช่น net_price ก่อน base_price)
        usort($varKeys, fn($a, $b) => strlen($b) - strlen($a));

        $result = $expression;
        foreach ($varKeys as $key) {
            $type = self::VARIABLES[$key]['type'] ?? 'numeric';
            if ($type === 'string') {
                $value = (string) ($context[$key] ?? '');
                $formatted = '"' . $value . '"';
            } else {
                $value = isset($context[$key]) ? (float) $context[$key] : 0.0;
                $formatted = $this->formatValue($value);
            }
            $result = preg_replace('/\b' . preg_quote($key, '/') . '\b/', $formatted, $result);
        }
        return $result;
    }

    /**
     * คืนคู่ตัวแปร + ค่า + label สำหรับตัวแปรที่ใช้ในสูตร
     */
    public function getUsedVariablesWithValues(string $expression, array $context): array
    {
        $used = $this->extractVariables($expression);
        $result = [];
        foreach ($used as $name) {
            $meta = self::VARIABLES[$name] ?? null;
            $type = $meta['type'] ?? 'numeric';
            $value = $type === 'string'
                ? (string) ($context[$name] ?? '')
                : (float) ($context[$name] ?? 0);
            $result[] = [
                'name'  => $name,
                'label' => $meta['label'] ?? $name,
                'unit'  => $meta['unit'] ?? '',
                'scope' => $meta['scope'] ?? '',
                'type'  => $type,
                'value' => $value,
            ];
        }
        return $result;
    }

    /** จัดรูปตัวเลขสำหรับแสดงในสูตรแทนค่า */
    private function formatValue(float $value): string
    {
        // ตัวเลขเต็ม → ไม่มีทศนิยม, มีทศนิยม → 2 หลัก
        if ($value == floor($value)) {
            return number_format($value, 0, '.', ',');
        }
        return number_format($value, 2, '.', ',');
    }

    /**
     * คืนข้อมูลตัวแปรทั้งหมด (สำหรับ /api/fee-formulas/variables)
     */
    public static function getAvailableVariables(): array
    {
        $list = [];
        foreach (self::VARIABLES as $key => $meta) {
            $list[] = [
                'name'  => $key,
                'label' => $meta['label'],
                'scope' => $meta['scope'],
                'unit'  => $meta['unit'],
                'type'  => $meta['type'] ?? 'numeric',
            ];
        }
        return $list;
    }
}
