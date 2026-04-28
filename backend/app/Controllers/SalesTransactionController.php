<?php

namespace App\Controllers;

use App\Services\SalesTransactionService;
use App\Services\CancelSaleService;
use App\Services\TransferService;
use App\Services\BudgetMovementService;
use CodeIgniter\HTTP\ResponseInterface;
use RuntimeException;

class SalesTransactionController extends BaseController
{
    private SalesTransactionService $svc;
    private CancelSaleService $cancelSvc;
    private TransferService $transferSvc;
    private BudgetMovementService $budgetSvc;

    public function __construct()
    {
        $this->svc = new SalesTransactionService();
        $this->cancelSvc = new CancelSaleService();
        $this->transferSvc = new TransferService();
        $this->budgetSvc = new BudgetMovementService();
    }

    private function isAdmin(): bool { return ($this->request->user_role ?? '') === 'admin'; }
    private function isManager(): bool { return ($this->request->user_role ?? '') === 'manager'; }
    private function canAccessProject(int $pid): bool {
        if ($this->isAdmin()) return true;
        return in_array($pid, array_map('intval', (array) ($this->request->project_ids ?? [])), true);
    }
    private function getAccessLevel(int $projectId): string {
        if ($this->isAdmin()) return 'edit';
        $projectAccess = $this->request->project_access ?? null;
        if ($projectAccess && is_object($projectAccess)) {
            return (string) ($projectAccess->{$projectId} ?? 'view');
        }
        return 'view';
    }
    private function userId(): int { return (int) ($this->request->user_id ?? 0); }
    private function db(): \CodeIgniter\Database\BaseConnection { return \Config\Database::connect(); }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/sales-transactions
    // ═══════════════════════════════════════════════════════════════════════

    public function index(): ResponseInterface
    {
        $pid = (int) ($this->request->getGet('project_id') ?? 0);
        if ($pid <= 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        if (!$this->canAccessProject($pid)) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);

        $page    = max(1, (int) ($this->request->getGet('page') ?? 1));
        $perPage = max(1, min(100, (int) ($this->request->getGet('per_page') ?? 20)));
        $offset  = ($page - 1) * $perPage;

        $builder = $this->db()->table('sales_transactions st')
            ->select('st.*, pu.unit_code, pu.status as unit_status, pu.standard_budget, p.name as project_name, p.pool_budget_amount')
            ->join('project_units pu', 'pu.id = st.unit_id', 'left')
            ->join('projects p', 'p.id = st.project_id', 'left')
            ->where('st.project_id', $pid);

        if ($uid = (int) $this->request->getGet('unit_id')) {
            $builder->where('st.unit_id', $uid);
        }

        if ($status = $this->request->getGet('status')) {
            $builder->where('st.status', $status);
        }

        if ($df = $this->request->getGet('date_from')) {
            $builder->where('st.sale_date >=', $df);
        }
        if ($dt = $this->request->getGet('date_to')) {
            $builder->where('st.sale_date <=', $dt);
        }

        if ($search = trim($this->request->getGet('search') ?? '')) {
            $builder->groupStart()
                ->like('st.sale_no', $search)
                ->orLike('pu.unit_code', $search)
                ->groupEnd();
        }

        $sortField = $this->request->getGet('sort') ?? 'st.sale_date';
        $sortDir = strtoupper($this->request->getGet('dir') ?? 'DESC');
        $sortDir = in_array($sortDir, ['ASC', 'DESC']) ? $sortDir : 'DESC';
        
        $allowedSorts = ['st.sale_date', 'st.net_price', 'st.profit', 'st.created_at'];
        if (!in_array($sortField, $allowedSorts, true)) {
            $sortField = 'st.sale_date';
        }
        $builder->orderBy($sortField, $sortDir);

        $countBuilder = clone $builder;
        $total = $countBuilder->countAllResults(false);

        $data = $builder->limit($perPage, $offset)->get()->getResultArray();

        // ═══ คำนวณ total_budget_remaining + net_extra_budget_used จาก BudgetMovementService (single source of truth) ═══
        // ดึง net_extra_budget_used จาก transaction items (งบอื่นที่ใช้ per-transaction)
        $txIds = array_column($data, 'id');
        $otherUsedMap = [];
        if (!empty($txIds)) {
            $itemRows = $this->db()->table('sales_transaction_items')
                ->select('sales_transaction_id, SUM(used_value) as other_total')
                ->where('funding_source_type !=', 'UNIT_STANDARD')
                ->whereIn('sales_transaction_id', $txIds)
                ->groupBy('sales_transaction_id')
                ->get()->getResultArray();
            foreach ($itemRows as $ir) {
                $otherUsedMap[(int) $ir['sales_transaction_id']] = (float) $ir['other_total'];
            }
        }

        // cache budget summary ต่อ unit (หลาย transaction อาจชี้ unit เดียวกัน)
        $summaryCache = [];
        foreach ($data as &$row) {
            $rowPid = (int) $row['project_id'];
            $rowUid = (int) $row['unit_id'];
            $cacheKey = "{$rowPid}_{$rowUid}";

            try {
                if (!isset($summaryCache[$cacheKey])) {
                    $summaryCache[$cacheKey] = $this->budgetSvc->getUnitBudgetSummary($rowPid, $rowUid);
                }
                $summary = $summaryCache[$cacheKey];
                $row['total_budget_remaining'] = $summary['total_remaining'] ?? 0;

                // งบนอกสุทธิที่ใช้ = งบอื่นที่ใช้ (items ของ transaction นี้) - งบยูนิตคงเหลือ
                $unitRemaining = $summary['UNIT_STANDARD']['remaining'] ?? 0;
                $otherUsed     = $otherUsedMap[(int) $row['id']] ?? 0;
                $netExtra      = $otherUsed - $unitRemaining;
                $row['net_extra_budget_used'] = $netExtra > 0 ? round($netExtra, 2) : 0;
            } catch (\Throwable $e) {
                $row['total_budget_remaining'] = null;
                $row['net_extra_budget_used']  = null;
            }
        }
        unset($row);

        // ═══ ยอดรวมทั้งโครงการ — เฉพาะยูนิตที่มี active transaction ═══
        $activeUnitIds = $this->db()->table('sales_transactions')
            ->select('DISTINCT(unit_id) as unit_id')
            ->where('project_id', $pid)
            ->where('status', 'active')
            ->get()->getResultArray();
        $activeUnitIds = array_map(fn($r) => (int) $r['unit_id'], $activeUnitIds);

        $projectTotals = !empty($activeUnitIds)
            ? $this->budgetSvc->getProjectBudgetTotals($pid, $activeUnitIds)
            : ['total_remaining' => 0, 'total_allocated' => 0, 'total_used' => 0];

        return $this->response->setStatusCode(200)->setJSON([
            'data' => $data,
            'total' => $total,
            'page' => $page,
            'per_page' => $perPage,
            'summary' => [
                'total_budget_remaining'      => $projectTotals['total_remaining'],
                'total_budget_allocated'      => $projectTotals['total_allocated'],
                'total_budget_used'           => $projectTotals['total_used'],
                // งบผู้บริหารคงเหลือ — project-wide (ไม่ filter ตาม unit ที่มี active transaction)
                'management_budget_remaining' => $this->budgetSvc->getManagementBudgetRemaining($pid),
            ],
        ]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/sales-transactions/:id
    // ═══════════════════════════════════════════════════════════════════════

    public function show(int $id): ResponseInterface
    {
        $transaction = $this->db()->table('sales_transactions st')
            ->select('st.*, pu.unit_code, pu.status as unit_status, pu.standard_budget, p.name as project_name, p.pool_budget_amount, u.name as created_by_name, tu.name as transferred_by_name, cu.name as cancelled_by_name')
            ->join('project_units pu', 'pu.id = st.unit_id', 'left')
            ->join('projects p', 'p.id = st.project_id', 'left')
            ->join('users u', 'u.id = st.created_by', 'left')
            ->join('users tu', 'tu.id = st.transferred_by', 'left')
            ->join('users cu', 'cu.id = st.cancelled_by', 'left')
            ->where('st.id', $id)
            ->get()->getRowArray();

        if (!$transaction) {
            return $this->response->setStatusCode(404)->setJSON(['error' => 'ไม่พบรายการขาย']);
        }

        if (!$this->canAccessProject((int) $transaction['project_id'])) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึง']);
        }

        $items = $this->db()->table('sales_transaction_items sti')
            ->select('sti.*, pim.name as promotion_item_name, pim.category as promotion_category, pim.value_mode')
            ->join('promotion_item_master pim', 'pim.id = sti.promotion_item_id', 'left')
            ->where('sti.sales_transaction_id', $id)
            ->get()->getResultArray();

        foreach ($items as &$item) {
            if ($item['value_mode'] === 'calculated') {
                $formula = $this->db()->table('fee_formulas')
                    ->where('promotion_item_id', $item['promotion_item_id'])
                    ->get()->getRowArray();
                $item['fee_formula'] = $formula;
            }
        }
        unset($item);

        $movements = $this->db()->table('budget_movements')
            ->where('reference_id', $id)
            ->where('reference_type', 'sales_transaction')
            ->get()->getResultArray();

        // ═══ คำนวณสรุปงบประมาณ (ใช้ BudgetMovementService เป็น single source of truth) ═══
        $unitId = (int) $transaction['unit_id'];
        $projectId = (int) $transaction['project_id'];

        $summary = $this->budgetSvc->getUnitBudgetSummary($projectId, $unitId);

        $us   = $summary['UNIT_STANDARD']      ?? ['allocated' => 0, 'used' => 0, 'remaining' => 0];
        $pool = $summary['PROJECT_POOL']        ?? ['allocated' => 0, 'used' => 0, 'remaining' => 0];
        $mgmt = $summary['MANAGEMENT_SPECIAL']  ?? ['allocated' => 0, 'used' => 0, 'remaining' => 0];

        $budgetSummary = [
            'unit_budget'           => $us['allocated'],
            'unit_budget_used'      => $us['used'],
            'unit_budget_remaining' => $us['remaining'],
            'pool_budget'           => $pool['allocated'],
            'pool_budget_used'      => $pool['used'],
            'pool_budget_remaining' => $pool['remaining'],
            'mgmt_budget'           => $mgmt['allocated'],
            'mgmt_budget_used'      => $mgmt['used'],
            'mgmt_budget_remaining' => $mgmt['remaining'],
            'total_remaining'       => ($summary['total_remaining'] ?? ($us['remaining'] + $pool['remaining'] + $mgmt['remaining'])),
        ];


        return $this->response->setStatusCode(200)->setJSON([
            'sales_transaction' => $transaction,
            'items' => $items,
            'budget_movements' => $movements,
            'budget_summary' => $budgetSummary,
        ]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/sales-transactions
    // ═══════════════════════════════════════════════════════════════════════

    public function create(): ResponseInterface
    {
        $role = $this->request->user_role ?? '';
        
        if (!in_array($role, ['admin', 'manager', 'sales'], true)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);
        }

        $body = $this->request->getJSON(true) ?? [];
        $pid = (int) ($body['project_id'] ?? 0);
        
        if ($pid <= 0) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        }
        
        $accessLevel = $this->getAccessLevel($pid);
        if ($accessLevel !== 'edit') {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์แก้ไข']);
        }
        
        if (!$this->canAccessProject($pid)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $body['created_by'] = $this->userId();

        try {
            $result = $this->svc->create($body);
            return $this->response->setStatusCode(201)->setJSON([
                'message' => 'บันทึกรายการขายสำเร็จ',
                'data' => $result,
            ]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PUT /api/sales-transactions/:id
    // ═══════════════════════════════════════════════════════════════════════

    public function update(int $id): ResponseInterface
    {
        $role = $this->request->user_role ?? '';
        
        if (!in_array($role, ['admin', 'manager'], true)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);
        }

        $body = $this->request->getJSON(true) ?? [];

        $transaction = $this->db()->table('sales_transactions')
            ->where('id', $id)->get()->getRowArray();

        if (!$transaction) {
            return $this->response->setStatusCode(404)->setJSON(['error' => 'ไม่พบรายการขาย']);
        }

        $pid = (int) ($body['project_id'] ?? $transaction['project_id']);
        
        $accessLevel = $this->getAccessLevel($pid);
        if ($accessLevel !== 'edit') {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์แก้ไข']);
        }
        
        if (!$this->canAccessProject($pid)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        $body['created_by'] = $this->userId();

        try {
            $result = $this->svc->update($id, $body);
            return $this->response->setStatusCode(200)->setJSON([
                'message' => 'แก้ไขรายการขายสำเร็จ',
                'data' => $result,
            ]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }


    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/sales-transactions/:id/cancel
    // ═══════════════════════════════════════════════════════════════════════

    public function cancelSale(int $id): ResponseInterface
    {
        $body = $this->request->getJSON(true) ?? [];
        $reason = trim($body["reason"] ?? "");

        if ($reason === "") {
            return $this->response->setStatusCode(422)->setJSON(["error" => "กรุณาระบุเหตุผลการยกเลิก"]);
        }

        if (strlen($reason) > 500) {
            return $this->response->setStatusCode(422)->setJSON(["error" => "เหตุผลต้องไม่เกิน 500 ตัวอักษร"]);
        }

        try {
            $result = $this->cancelSvc->cancelSale($id, $reason, $this->userId());
            return $this->response->setStatusCode(200)->setJSON([
                "message" => "ยกเลิกรายการขายสำเร็จ",
                "data"    => $result,
            ]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(["error" => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/sales-transactions/:id/transfer
    // ═══════════════════════════════════════════════════════════════════════

    public function transfer(int $id): ResponseInterface
    {
        $body = $this->request->getJSON(true) ?? [];
        $transferDate = trim($body['transfer_date'] ?? '');

        if ($transferDate === '') {
            return $this->response->setStatusCode(422)->setJSON(['error' => 'กรุณาระบุวันที่โอน']);
        }

        // validate date format
        $d = \DateTime::createFromFormat('Y-m-d', $transferDate);
        if (!$d || $d->format('Y-m-d') !== $transferDate) {
            return $this->response->setStatusCode(422)->setJSON(['error' => 'รูปแบบวันที่ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)']);
        }

        try {
            $result = $this->transferSvc->markAsTransferred($id, $transferDate, $this->userId());
            return $this->response->setStatusCode(200)->setJSON([
                'message' => 'โอนกรรมสิทธิ์สำเร็จ',
                'data'    => $result,
            ]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }
}
