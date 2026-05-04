<?php

namespace App\Controllers;

use App\Services\PromotionItemService;
use App\Services\EligiblePromotionService;
use CodeIgniter\HTTP\ResponseInterface;
use RuntimeException;

class PromotionItemController extends BaseController
{
    private PromotionItemService $service;
    public function __construct() { $this->service = new PromotionItemService(); }

    private function isAdmin(): bool { return ($this->request->user_role ?? '') === 'admin'; }
    private function canWrite(): bool { return in_array($this->request->user_role ?? '', ['admin', 'manager'], true); }
    private function canAccessProject(int $pid): bool {
        if ($this->isAdmin()) return true;
        return in_array($pid, array_map('intval', (array) ($this->request->project_ids ?? [])), true);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/promotion-items?project_id=
    // ═══════════════════════════════════════════════════════════════════════

    public function index(): ResponseInterface
    {
        $projectId = (int) ($this->request->getGet('project_id') ?? 0);
        if ($projectId <= 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุโครงการ']);
        if (!$this->canAccessProject($projectId)) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);

        $filters = [
            'category'         => $this->request->getGet('category'),
            'value_mode'       => $this->request->getGet('value_mode'),
            'is_unit_standard' => $this->request->getGet('is_unit_standard'),
            'is_active'        => $this->request->getGet('is_active'),
            'search'           => $this->request->getGet('search'),
        ];
        return $this->response->setStatusCode(200)->setJSON(['data' => $this->service->getList($projectId, $filters)]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/promotion-items/:id
    // ═══════════════════════════════════════════════════════════════════════

    public function show(int $id): ResponseInterface
    {
        $item = $this->service->getById($id);
        if (!$item) return $this->response->setStatusCode(404)->setJSON(['error' => 'ไม่พบรายการโปรโมชั่น']);
        if (!$this->canAccessProject((int) $item['project_id'])) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์ดูรายการของแถมโครงการอื่น']);
        }
        return $this->response->setStatusCode(200)->setJSON(['data' => $item]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/promotion-items
    // ═══════════════════════════════════════════════════════════════════════

    public function create(): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์สร้างรายการ']);
        $body = $this->request->getJSON(true) ?? [];
        $projectId = (int) ($body['project_id'] ?? 0);
        if ($projectId <= 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุโครงการ']);
        if (!$this->canAccessProject($projectId)) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);

        try {
            $item = $this->service->create($projectId, $body, (array) ($body['eligible_house_model_ids'] ?? []), (array) ($body['eligible_unit_ids'] ?? []));
            return $this->response->setStatusCode(201)->setJSON(['message' => 'สร้างรายการโปรโมชั่นสำเร็จ', 'data' => $item]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PUT /api/promotion-items/:id
    // ═══════════════════════════════════════════════════════════════════════

    public function update(int $id): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์แก้ไขรายการ']);
        $body = $this->request->getJSON(true) ?? [];

        try {
            $item = $this->service->update($id, $body, (array) ($body['eligible_house_model_ids'] ?? []), (array) ($body['eligible_unit_ids'] ?? []));
            return $this->response->setStatusCode(200)->setJSON(['message' => 'อัปเดตรายการโปรโมชั่นสำเร็จ', 'data' => $item]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DELETE /api/promotion-items/:id
    // ═══════════════════════════════════════════════════════════════════════

    public function delete(int $id): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์ลบรายการ']);
        try {
            $this->service->delete($id);
            return $this->response->setStatusCode(200)->setJSON(['message' => 'ลบรายการโปรโมชั่นสำเร็จ']);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/promotion-items/browse-source
    // ─── ค้นจาก caldiscount.freebies (db connection) สำหรับ import เข้าโครงการ
    // ═══════════════════════════════════════════════════════════════════════

    public function browseSource(): ResponseInterface
    {
        if (!$this->canWrite()) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึง']);
        }

        $projectId = (int) ($this->request->getGet('project_id') ?? 0);
        if ($projectId <= 0) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        }
        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $q       = trim((string) ($this->request->getGet('q') ?? ''));
        $pjCode  = trim((string) ($this->request->getGet('pj_code') ?? ''));
        $page    = max(1, (int) ($this->request->getGet('page') ?? 1));
        $perPage = (int) ($this->request->getGet('per_page') ?? 20);
        $perPage = max(1, min(100, $perPage));
        $offset  = ($page - 1) * $perPage;

        try {
            $src = \Config\Database::connect('db');
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(503)->setJSON(
                ['error' => 'ไม่สามารถเชื่อมต่อ DB ระบบเดิมได้']
            );
        }

        $builder = $src->table('freebies')
            ->select('fre_code, fre_name, fre_calculation_type, fre_formula, fre_pj_code,
                      fre_fixed_value, fre_amt_convert_to_dc, fre_remark, fre_ordering')
            ->where('fre_is_active', '1')
            ->where('fre_deleted_at', null);

        if ($q !== '') {
            $builder->groupStart()
                ->like('fre_code', $q)
                ->orLike('fre_name', $q)
                ->orLike('fre_remark', $q)
                ->orLike('fre_pj_code', $q)
                ->groupEnd();
        }

        if ($pjCode !== '') {
            // case-insensitive (fre_pj_code มีทั้ง upper/lower ในระบบเก่า)
            $builder->where('UPPER(fre_pj_code)', strtoupper($pjCode));
        }

        $total = (clone $builder)->countAllResults(false);

        $rows = $builder
            ->orderBy('fre_ordering', 'ASC')
            ->orderBy('fre_code', 'ASC')
            ->limit($perPage, $offset)
            ->get()->getResultArray();

        // เช็ค code ที่ import เข้า project นี้แล้ว
        $codes = array_column($rows, 'fre_code');
        $existingCodes = [];
        if (! empty($codes)) {
            $rowsExist = \Config\Database::connect()
                ->table('promotion_item_master')
                ->select('code')
                ->where('project_id', $projectId)
                ->whereIn('code', $codes)
                ->get()->getResultArray();
            $existingCodes = array_flip(array_column($rowsExist, 'code'));
        }

        $data = [];
        foreach ($rows as $r) {
            $valueMode = $this->mapValueMode(
                (string) $r['fre_calculation_type'],
                (string) ($r['fre_formula'] ?? '')
            );

            $data[] = [
                'fre_code'              => $r['fre_code'],
                'fre_name'              => $r['fre_name'],
                'fre_pj_code'           => $r['fre_pj_code'],
                'fre_calculation_type'  => $r['fre_calculation_type'],
                'fre_formula'           => $r['fre_formula'],
                'fre_fixed_value'       => $r['fre_fixed_value'],
                'fre_amt_convert_to_dc' => $r['fre_amt_convert_to_dc'],
                'fre_remark'            => $r['fre_remark'],
                'fre_ordering'          => $r['fre_ordering'],
                'suggested_value_mode'  => $valueMode,
                'already_added'         => isset($existingCodes[$r['fre_code']]),
            ];
        }

        return $this->response->setStatusCode(200)->setJSON([
            'data' => $data,
            'meta' => [
                'total'     => $total,
                'page'      => $page,
                'per_page'  => $perPage,
                'last_page' => max(1, (int) ceil($total / $perPage)),
            ],
        ]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/promotion-items/bulk-import
    // ─── นำเข้ารายการจาก caldiscount.freebies ทีละหลายรายการ
    // ═══════════════════════════════════════════════════════════════════════

    public function bulkImport(): ResponseInterface
    {
        if (!$this->canWrite()) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์นำเข้ารายการ']);
        }

        $body            = $this->request->getJSON(true) ?? [];
        $projectId       = (int) ($body['project_id'] ?? 0);
        $defaultCategory = (string) ($body['default_category'] ?? '');
        $codes           = $body['fre_codes'] ?? [];

        if ($projectId <= 0) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        }
        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $validCategories = ['discount', 'premium', 'expense_support'];
        if (!in_array($defaultCategory, $validCategories, true)) {
            return $this->response->setStatusCode(422)->setJSON(
                ['error' => 'default_category ต้องเป็น: ' . implode(', ', $validCategories)]
            );
        }

        if (!is_array($codes) || empty($codes)) {
            return $this->response->setStatusCode(422)->setJSON(
                ['error' => 'กรุณาเลือกรายการอย่างน้อย 1 รายการ']
            );
        }

        $codes = array_values(array_unique(array_filter(array_map(
            static fn($v) => trim((string) $v),
            $codes
        ), static fn($v) => $v !== '')));

        if (empty($codes)) {
            return $this->response->setStatusCode(422)->setJSON(['error' => 'รหัสที่เลือกไม่ถูกต้อง']);
        }

        if (count($codes) > 200) {
            return $this->response->setStatusCode(422)->setJSON(['error' => 'นำเข้าได้สูงสุดครั้งละ 200 รายการ']);
        }

        try {
            $src = \Config\Database::connect('db');
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(503)->setJSON(
                ['error' => 'ไม่สามารถเชื่อมต่อ DB ระบบเดิมได้']
            );
        }

        $sourceRows = $src->table('freebies')
            ->select('fre_code, fre_name, fre_calculation_type, fre_formula,
                      fre_fixed_value, fre_amt_convert_to_dc, fre_ordering')
            ->whereIn('fre_code', $codes)
            ->where('fre_is_active', '1')
            ->where('fre_deleted_at', null)
            ->get()->getResultArray();

        $byCode = [];
        foreach ($sourceRows as $r) {
            $byCode[(string) $r['fre_code']] = $r;
        }

        $defaultDb = \Config\Database::connect();
        $existing = $defaultDb->table('promotion_item_master')
            ->select('code')
            ->where('project_id', $projectId)
            ->whereIn('code', $codes)
            ->get()->getResultArray();
        $existingCodes = array_flip(array_column($existing, 'code'));

        $now             = date('Y-m-d H:i:s');
        $created         = 0;
        $calculatedCount = 0;
        $skipped         = [];
        $errors          = [];

        foreach ($codes as $code) {
            if (! isset($byCode[$code])) {
                $skipped[] = ['fre_code' => $code, 'reason' => 'ไม่พบในต้นทางหรือถูกปิดใช้งาน'];
                continue;
            }
            if (isset($existingCodes[$code])) {
                $skipped[] = ['fre_code' => $code, 'reason' => 'มีในโครงการนี้แล้ว'];
                continue;
            }

            $r = $byCode[$code];
            $valueMode = $this->mapValueMode(
                (string) $r['fre_calculation_type'],
                (string) ($r['fre_formula'] ?? '')
            );
            if ($valueMode === 'calculated') {
                $calculatedCount++;
            }

            try {
                $defaultDb->table('promotion_item_master')->insert([
                    'project_id'             => $projectId,
                    'code'                   => $r['fre_code'],
                    'name'                   => $r['fre_name'],
                    'category'               => $defaultCategory,
                    'value_mode'             => $valueMode,
                    'default_value'          => $r['fre_fixed_value'] !== null ? $r['fre_fixed_value'] : 0,
                    'discount_convert_value' => $r['fre_amt_convert_to_dc'] ?? null,
                    'is_unit_standard'       => 0,
                    'is_active'              => 1,
                    'sort_order'             => (int) ($r['fre_ordering'] ?? 0),
                    'created_at'             => $now,
                    'updated_at'             => $now,
                ]);
                $created++;
            } catch (\Throwable $e) {
                $errors[] = ['fre_code' => $code, 'reason' => $e->getMessage()];
            }
        }

        return $this->response->setStatusCode(200)->setJSON([
            'message' => "นำเข้าสำเร็จ {$created} รายการ",
            'data'    => [
                'created'          => $created,
                'calculated_count' => $calculatedCount,
                'skipped'          => $skipped,
                'errors'           => $errors,
            ],
        ]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/promotion-items/source-projects
    // ─── ดึง distinct fre_pj_code จาก freebies (สำหรับ filter dropdown)
    // ═══════════════════════════════════════════════════════════════════════

    public function sourceProjects(): ResponseInterface
    {
        if (!$this->canWrite()) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึง']);
        }

        try {
            $src = \Config\Database::connect('db');
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(503)->setJSON(
                ['error' => 'ไม่สามารถเชื่อมต่อ DB ระบบเดิมได้']
            );
        }

        // group by UPPER เพื่อรวมรหัสที่เป็น upper/lower เหมือนกัน
        $rows = $src->table('freebies')
            ->select('UPPER(fre_pj_code) AS code, COUNT(*) AS total')
            ->where('fre_is_active', '1')
            ->where('fre_deleted_at', null)
            ->where('fre_pj_code IS NOT NULL', null, false)
            ->where('fre_pj_code !=', '')
            ->groupBy('UPPER(fre_pj_code)')
            ->orderBy('code', 'ASC')
            ->get()->getResultArray();

        return $this->response->setStatusCode(200)->setJSON([
            'data' => array_map(static fn($r) => [
                'code'  => $r['code'],
                'total' => (int) $r['total'],
            ], $rows),
        ]);
    }

    /**
     * แปลง fre_calculation_type/fre_formula ของ freebies → value_mode ของระบบเรา
     * - fixed                              → fixed
     * - formula + formula='input'          → manual (user กรอกตอนขาย)
     * - formula + formula อื่น              → calculated (ต้องสร้าง formula ในระบบเรา)
     */
    private function mapValueMode(string $calcType, string $formula): string
    {
        if ($calcType === 'fixed') {
            return 'fixed';
        }
        if ($calcType === 'formula' && strtolower(trim($formula)) === 'input') {
            return 'manual';
        }
        return 'calculated';
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/promotion-items/eligible?project_id=&unit_id=&sale_date=
    // ═══════════════════════════════════════════════════════════════════════

    public function eligible(): ResponseInterface
    {
        $projectId = (int) ($this->request->getGet('project_id') ?? 0);
        $unitId    = (int) ($this->request->getGet('unit_id') ?? 0);
        $saleDate  = $this->request->getGet('sale_date') ?? date('Y-m-d');

        if ($projectId <= 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        if ($unitId <= 0)    return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ unit_id']);
        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        try {
            $eligibleSvc = new EligiblePromotionService();
            $result = $eligibleSvc->getEligibleItems($projectId, $unitId, $saleDate);
            return $this->response->setStatusCode(200)->setJSON(['data' => $result]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }
}
