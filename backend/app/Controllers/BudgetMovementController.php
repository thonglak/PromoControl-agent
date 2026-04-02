<?php

namespace App\Controllers;

use App\Services\BudgetMovementService;
use CodeIgniter\HTTP\ResponseInterface;
use RuntimeException;

class BudgetMovementController extends BaseController
{
    private BudgetMovementService $svc;

    public function __construct()
    {
        $this->svc = new BudgetMovementService();
    }

    private function isAdmin(): bool { return ($this->request->user_role ?? '') === 'admin'; }
    private function canWrite(): bool { return in_array($this->request->user_role ?? '', ['admin', 'manager'], true); }
    private function canAccessProject(int $pid): bool {
        if ($this->isAdmin()) return true;
        return in_array($pid, array_map('intval', (array) ($this->request->project_ids ?? [])), true);
    }
    private function userId(): int { return (int) ($this->request->user_id ?? 0); }
    private function db(): \CodeIgniter\Database\BaseConnection { return \Config\Database::connect(); }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/budget-movements?project_id=&unit_id=&...
    // ═══════════════════════════════════════════════════════════════════════

    public function index(): ResponseInterface
    {
        $pid = (int) ($this->request->getGet('project_id') ?? 0);
        if ($pid <= 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        if (!$this->canAccessProject($pid)) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);

        $page    = max(1, (int) ($this->request->getGet('page') ?? 1));
        $perPage = max(1, min(100, (int) ($this->request->getGet('per_page') ?? 20)));
        $offset  = ($page - 1) * $perPage;

        $builder = $this->db()->table('budget_movements bm')
            ->select('bm.*, pu.unit_code, cu.name AS created_by_name, au.name AS approved_by_name')
            ->join('project_units pu', 'pu.id = bm.unit_id', 'left')
            ->join('users cu', 'cu.id = bm.created_by', 'left')
            ->join('users au', 'au.id = bm.approved_by', 'left')
            ->where('bm.project_id', $pid);

        if ($uid = (int) $this->request->getGet('unit_id'))              $builder->where('bm.unit_id', $uid);
        if ($src = $this->request->getGet('budget_source_type')) {
            if (str_contains($src, ',')) {
                $builder->whereIn('bm.budget_source_type', explode(',', $src));
            } else {
                $builder->where('bm.budget_source_type', $src);
            }
        }
        if ($mt  = $this->request->getGet('movement_type'))              $builder->where('bm.movement_type', $mt);
        if ($st  = $this->request->getGet('status'))                     $builder->where('bm.status', $st);
        if ($df  = $this->request->getGet('date_from'))                  $builder->where('bm.created_at >=', $df);
        if ($dt  = $this->request->getGet('date_to'))                    $builder->where('bm.created_at <=', $dt . ' 23:59:59');

        $countBuilder = clone $builder;
        $total = $countBuilder->countAllResults(false);

        $data = $builder->orderBy('bm.created_at', 'DESC')
            ->limit($perPage, $offset)
            ->get()->getResultArray();

        return $this->response->setStatusCode(200)->setJSON([
            'data' => $data, 'total' => $total, 'page' => $page, 'per_page' => $perPage,
        ]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/budget-movements/summary/:unitId?project_id=
    // ═══════════════════════════════════════════════════════════════════════

    public function unitSummary(int $unitId): ResponseInterface
    {
        $pid = (int) ($this->request->getGet('project_id') ?? 0);
        if ($pid <= 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        if (!$this->canAccessProject($pid)) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);

        try {
            $summary = $this->svc->getUnitBudgetSummary($pid, $unitId);

            // เพิ่ม recent_movements + pending_count
            $summary['recent_movements'] = $this->db()->table('budget_movements')
                ->select('id, movement_no, movement_type, budget_source_type, amount, status, created_at')
                ->where('project_id', $pid)->where('unit_id', $unitId)
                ->orderBy('created_at', 'DESC')->limit(5)->get()->getResultArray();

            $summary['pending_count'] = (int) $this->db()->table('budget_movements')
                ->where('project_id', $pid)->where('unit_id', $unitId)->where('status', 'pending')
                ->countAllResults();

            return $this->response->setStatusCode(200)->setJSON(['data' => $summary]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/budget-movements/pool-balance?project_id=
    // ═══════════════════════════════════════════════════════════════════════

    public function poolBalance(): ResponseInterface
    {
        $pid = (int) ($this->request->getGet('project_id') ?? 0);
        if ($pid <= 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        if (!$this->canAccessProject($pid)) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);

        $project = $this->db()->table('projects')->select('pool_budget_amount')->where('id', $pid)->get()->getRowArray();
        $poolAmount = (float) ($project['pool_budget_amount'] ?? 0);

        $allocFromPool = (float) ($this->db()->table('budget_movements')
            ->selectSum('amount', 'total')
            ->where('project_id', $pid)->where('budget_source_type', 'PROJECT_POOL')
            ->whereIn('movement_type', ['ALLOCATE', 'SPECIAL_BUDGET_ADD', 'SPECIAL_BUDGET_ALLOCATE'])
            ->where('status', 'approved')
            ->get()->getRowArray()['total'] ?? 0);

        // RETURN กลับ pool → รวมทุก source (UNIT_STANDARD, PROJECT_POOL, MANAGEMENT_SPECIAL)
        $returnToPool = (float) ($this->db()->table('budget_movements')
            ->selectSum('amount', 'total')
            ->where('project_id', $pid)
            ->whereIn('budget_source_type', ['UNIT_STANDARD', 'PROJECT_POOL', 'MANAGEMENT_SPECIAL'])
            ->whereIn('movement_type', ['RETURN', 'SPECIAL_BUDGET_RETURN'])
            ->where('status', 'approved')
            ->get()->getRowArray()['total'] ?? 0);

        $unitsWithPool = (int) $this->db()->table('budget_movements')
            ->select('unit_id')->distinct()
            ->where('project_id', $pid)->where('budget_source_type', 'PROJECT_POOL')
            ->whereIn('movement_type', ['ALLOCATE', 'SPECIAL_BUDGET_ALLOCATE'])
            ->where('status', 'approved')
            ->countAllResults();

        return $this->response->setStatusCode(200)->setJSON(['data' => [
            'pool_budget_amount'            => $poolAmount,
            'total_allocated_from_pool'     => $allocFromPool,
            'total_returned_to_pool'        => $returnToPool,
            'pool_remaining'                => $poolAmount - $allocFromPool + $returnToPool,
            'total_units_with_pool_allocation' => $unitsWithPool,
        ]]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/budget-movements
    // ═══════════════════════════════════════════════════════════════════════

    public function create(): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);
        $body = $this->request->getJSON(true) ?? [];
        $body['created_by'] = $this->userId();
        try {
            $r = $this->svc->createMovement($body);
            return $this->response->setStatusCode(201)->setJSON(['message' => 'สร้างรายการเคลื่อนไหวสำเร็จ', 'data' => $r]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/budget-movements/transfer
    // ═══════════════════════════════════════════════════════════════════════

    public function transfer(): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);
        $body = $this->request->getJSON(true) ?? [];
        $body['created_by'] = $this->userId();
        try {
            return $this->response->setStatusCode(200)->setJSON($this->svc->transferBudget($body));
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/budget-movements/:id/approve
    // ═══════════════════════════════════════════════════════════════════════

    public function approve(int $id): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);
        try {
            return $this->response->setStatusCode(200)->setJSON(['message' => 'อนุมัติสำเร็จ', 'data' => $this->svc->approveMovement($id, $this->userId())]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/budget-movements/:id/reject
    // ═══════════════════════════════════════════════════════════════════════

    public function reject(int $id): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);
        $body = $this->request->getJSON(true) ?? [];
        try {
            return $this->response->setStatusCode(200)->setJSON(['message' => 'ปฏิเสธสำเร็จ', 'data' => $this->svc->rejectMovement($id, $this->userId(), $body['reason'] ?? '')]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/budget-movements/return-special
    // ═══════════════════════════════════════════════════════════════════════

    public function returnSpecialBudget(): ResponseInterface
    {
        // ตรวจสิทธิ์: admin หรือ manager เท่านั้น
        if (!$this->canWrite()) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์ — ต้องเป็น admin หรือ manager']);
        }

        $body = $this->request->getJSON(true) ?? [];

        // ตรวจ required fields
        foreach (['project_id', 'unit_id', 'budget_source_type', 'amount', 'note'] as $f) {
            if (empty($body[$f]) && ($body[$f] ?? null) !== 0) {
                return $this->response->setStatusCode(422)->setJSON(['error' => "กรุณาระบุ {$f}"]);
            }
        }

        $pid = (int) $body['project_id'];

        // ตรวจสิทธิ์เข้าถึงโครงการ
        if (!$this->canAccessProject($pid)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        // ตรวจ unit_id อยู่ใน project_id
        $unit = $this->db()->table('project_units')
            ->where('id', (int) $body['unit_id'])
            ->where('project_id', $pid)
            ->get()->getRowArray();
        if (!$unit) {
            return $this->response->setStatusCode(422)->setJSON(['error' => 'ยูนิตไม่อยู่ในโครงการนี้']);
        }

        $body['created_by'] = $this->userId();

        try {
            $result = $this->svc->returnSpecialBudget($body);
            return $this->response->setStatusCode(200)->setJSON([
                'message' => 'คืนงบสำเร็จ',
                'data'    => $result,
            ]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(422)->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/budget-movements/transfer-special
    // ═══════════════════════════════════════════════════════════════════════

    public function transferSpecialBudget(): ResponseInterface
    {
        // ตรวจสิทธิ์: admin หรือ manager เท่านั้น
        if (!$this->canWrite()) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์ — ต้องเป็น admin หรือ manager']);
        }

        $body = $this->request->getJSON(true) ?? [];

        // ตรวจ required fields
        $required = ['from_unit_id', 'to_unit_id', 'budget_source_type', 'amount', 'note'];
        foreach ($required as $f) {
            if (empty($body[$f]) && ($body[$f] ?? null) !== 0) {
                return $this->response->setStatusCode(422)->setJSON(['error' => "กรุณาระบุ {$f}"]);
            }
        }

        // Validate amount > 0
        if (!is_numeric($body['amount']) || (float) $body['amount'] <= 0) {
            return $this->response->setStatusCode(422)->setJSON(['error' => 'จำนวนเงินต้องมากกว่า 0']);
        }

        // ดึง project_id จาก from_unit_id
        $fromUnit = $this->db()->table('project_units')
            ->select('id, project_id')
            ->where('id', (int) $body['from_unit_id'])
            ->get()->getRowArray();

        if (!$fromUnit) {
            return $this->response->setStatusCode(422)->setJSON(['error' => 'ไม่พบยูนิตต้นทาง']);
        }

        $pid = (int) $fromUnit['project_id'];

        // ตรวจสิทธิ์เข้าถึงโครงการ
        if (!$this->canAccessProject($pid)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        // ตรวจ access_level = edit
        if (!$this->isAdmin()) {
            $access = $this->db()->table('user_projects')
                ->select('access_level')
                ->where('user_id', $this->userId())
                ->where('project_id', $pid)
                ->get()->getRowArray();
            if (!$access || $access['access_level'] !== 'edit') {
                return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์แก้ไขโครงการนี้']);
            }
        }

        try {
            $result = $this->svc->transferSpecialBudget([
                'from_unit_id'       => (int) $body['from_unit_id'],
                'to_unit_id'         => (int) $body['to_unit_id'],
                'budget_source_type' => $body['budget_source_type'],
                'amount'             => (float) $body['amount'],
                'note'               => $body['note'],
                'transferred_by'     => $this->userId(),
                'project_id'         => $pid,
            ]);

            return $this->response->setStatusCode(200)->setJSON(['data' => $result]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(422)->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/budget-movements/void-special
    // ═══════════════════════════════════════════════════════════════════════

    public function voidSpecialBudget(): ResponseInterface
    {
        if (!$this->canWrite()) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์ — ต้องเป็น admin หรือ manager']);
        }

        $body = $this->request->getJSON(true) ?? [];

        foreach (['project_id', 'unit_id', 'budget_source_type', 'note'] as $f) {
            if (empty($body[$f]) && ($body[$f] ?? null) !== 0) {
                return $this->response->setStatusCode(422)->setJSON(['error' => "กรุณาระบุ {$f}"]);
            }
        }

        $pid = (int) $body['project_id'];

        if (!$this->canAccessProject($pid)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $unit = $this->db()->table('project_units')
            ->where('id', (int) $body['unit_id'])
            ->where('project_id', $pid)
            ->get()->getRowArray();
        if (!$unit) {
            return $this->response->setStatusCode(422)->setJSON(['error' => 'ยูนิตไม่อยู่ในโครงการนี้']);
        }

        $body['created_by'] = $this->userId();

        try {
            $result = $this->svc->voidSpecialBudget($body);
            return $this->response->setStatusCode(200)->setJSON([
                'message' => 'ยกเลิกงบสำเร็จ',
                'data'    => $result,
            ]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(422)->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/budget-movements/return-to-pool
    // ═══════════════════════════════════════════════════════════════════════

    public function returnUnitBudgetToPool(): ResponseInterface
    {
        // ตรวจสิทธิ์: admin หรือ manager เท่านั้น
        if (!$this->canWrite()) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์ — ต้องเป็น admin หรือ manager']);
        }

        $body = $this->request->getJSON(true) ?? [];

        // ตรวจ required fields
        foreach (['project_id', 'unit_id', 'amount'] as $f) {
            if (empty($body[$f]) && ($body[$f] ?? null) !== 0) {
                return $this->response->setStatusCode(422)->setJSON(['error' => "กรุณาระบุ {$f}"]);
            }
        }

        if (!is_numeric($body['amount']) || (float) $body['amount'] <= 0) {
            return $this->response->setStatusCode(422)->setJSON(['error' => 'จำนวนเงินต้องมากกว่า 0']);
        }

        $pid = (int) $body['project_id'];

        // ตรวจสิทธิ์เข้าถึงโครงการ
        if (!$this->canAccessProject($pid)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $body['created_by'] = $this->userId();

        try {
            $result = $this->svc->returnUnitBudgetToPool($body);
            return $this->response->setStatusCode(200)->setJSON([
                'message' => 'คืนงบเข้า Pool สำเร็จ',
                'data'    => $result,
            ]);
        } catch (\RuntimeException $e) {
            return $this->response->setStatusCode(422)->setJSON(['error' => $e->getMessage()]);
        }
    }


    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/budget-movements/batch-return-to-pool
    // ═══════════════════════════════════════════════════════════════════════

    public function batchReturnUnitBudgetToPool(): ResponseInterface
    {
        if (!$this->canWrite()) {
            return $this->response->setStatusCode(403)->setJSON(["error" => "ไม่มีสิทธิ์ — ต้องเป็น admin หรือ manager"]);
        }

        $body = $this->request->getJSON(true) ?? [];

        if (empty($body["project_id"])) {
            return $this->response->setStatusCode(422)->setJSON(["error" => "กรุณาระบุ project_id"]);
        }
        if (empty($body["items"]) || !is_array($body["items"])) {
            return $this->response->setStatusCode(422)->setJSON(["error" => "กรุณาระบุรายการยูนิต (items)"]);
        }

        $pid = (int) $body["project_id"];
        if (!$this->canAccessProject($pid)) {
            return $this->response->setStatusCode(403)->setJSON(["error" => "ไม่มีสิทธิ์เข้าถึงโครงการนี้"]);
        }

        $unitIds = array_map(fn($item) => (int) ($item["unit_id"] ?? 0), $body["items"]);
        $unitIds = array_filter($unitIds, fn($id) => $id > 0);

        if (empty($unitIds)) {
            return $this->response->setStatusCode(422)->setJSON(["error" => "ไม่มียูนิตที่ถูกต้อง"]);
        }

        try {
            $result = $this->svc->batchReturnUnitBudgetToPool(
                $unitIds,
                $pid,
                $body["remark"] ?? "",
                $this->userId()
            );

            return $this->response->setStatusCode(201)->setJSON([
                "message" => "คืนงบเข้า Pool สำเร็จ",
                "data"    => $result,
            ]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(422)->setJSON(["error" => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/budget-movements/units-with-remaining?project_id=
    // ═══════════════════════════════════════════════════════════════════════

    public function getUnitsWithRemaining(): ResponseInterface
    {
        $pid = (int) ($this->request->getGet("project_id") ?? 0);
        if ($pid <= 0) {
            return $this->response->setStatusCode(400)->setJSON(["error" => "กรุณาระบุ project_id"]);
        }
        if (!$this->canAccessProject($pid)) {
            return $this->response->setStatusCode(403)->setJSON(["error" => "ไม่มีสิทธิ์เข้าถึงโครงการนี้"]);
        }

        $units = $this->svc->getUnitsWithRemaining($pid);
        $poolBalance = $this->svc->getPoolBalance($pid);

        // ดึงชื่อโครงการ
        $project = $this->db()->table("projects")->select("id, name")->where("id", $pid)->get()->getRowArray();

        return $this->response->setStatusCode(200)->setJSON([
            "project" => [
                "id"           => $pid,
                "name"         => $project["name"] ?? "",
                "pool_balance" => $poolBalance,
            ],
            "units" => $units,
        ]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/budget-movements/return-history?project_id=&page=
    // ═══════════════════════════════════════════════════════════════════════

    public function getReturnHistory(): ResponseInterface
    {
        $pid = (int) ($this->request->getGet("project_id") ?? 0);
        if ($pid <= 0) {
            return $this->response->setStatusCode(400)->setJSON(["error" => "กรุณาระบุ project_id"]);
        }
        if (!$this->canAccessProject($pid)) {
            return $this->response->setStatusCode(403)->setJSON(["error" => "ไม่มีสิทธิ์เข้าถึงโครงการนี้"]);
        }

        $page = max(1, (int) ($this->request->getGet("page") ?? 1));
        $result = $this->svc->getReturnHistory($pid, $page);

        return $this->response->setStatusCode(200)->setJSON($result);
    }

}
