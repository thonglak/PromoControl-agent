<?php

namespace App\Controllers;

use CodeIgniter\HTTP\ResponseInterface;

class DevToolController extends BaseController
{
    private function isAdmin(): bool { return ($this->request->user_role ?? '') === 'admin'; }
    private function db(): \CodeIgniter\Database\BaseConnection { return \Config\Database::connect(); }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/dev/clear-transactions
    // ล้างข้อมูลการขาย + งบเคลื่อนไหว + ตั้งงบ ทั้งหมด (สำหรับ TEST)
    // ═══════════════════════════════════════════════════════════════════════

    public function clearTransactions(): ResponseInterface
    {
        if (!$this->isAdmin()) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'เฉพาะ admin เท่านั้น']);
        }

        $pid = (int) ($this->request->getJSON(true)['project_id'] ?? 0);
        if ($pid <= 0) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        }

        $db = $this->db();
        $db->transBegin();

        try {
            // 1. ลบ sales_transaction_items (ต้องลบก่อน เพราะ FK)
            $transactionIds = $db->table('sales_transactions')
                ->select('id')
                ->where('project_id', $pid)
                ->get()->getResultArray();
            $tids = array_column($transactionIds, 'id');

            $deletedItems = 0;
            $deletedTransactions = 0;
            $deletedMovements = 0;
            $deletedAllocations = 0;
            $resetUnits = 0;

            if (!empty($tids)) {
                $db->table('sales_transaction_items')
                    ->whereIn('sales_transaction_id', $tids)
                    ->delete();
                $deletedItems = $db->affectedRows();
            }

            // 2. ลบ sales_transactions
            $db->table('sales_transactions')
                ->where('project_id', $pid)
                ->delete();
            $deletedTransactions = $db->affectedRows();

            // 3. ลบ budget_movements ทั้งหมดของโครงการ
            $db->table('budget_movements')
                ->where('project_id', $pid)
                ->delete();
            $deletedMovements = $db->affectedRows();

            // 4. ลบ unit_budget_allocations ทั้งหมดของโครงการ
            $db->table('unit_budget_allocations')
                ->where('project_id', $pid)
                ->delete();
            $deletedAllocations = $db->affectedRows();

            // 5. Reset project_units status กลับเป็น available
            $db->table('project_units')
                ->where('project_id', $pid)
                ->where('status', 'sold')
                ->update([
                    'status' => 'available',
                    'customer_name' => null,
                    'salesperson' => null,
                    'sale_date' => null,
                    'updated_at' => date('Y-m-d H:i:s'),
                ]);
            $resetUnits = $db->affectedRows();

            // 6. Reset number_series ของ SALE และ BUDGET_MOVE
            $seriesIds = $db->table('number_series')
                ->select('id')
                ->where('project_id', $pid)
                ->whereIn('document_type', ['SALE', 'BUDGET_MOVE'])
                ->get()->getResultArray();
            $sids = array_column($seriesIds, 'id');

            $db->table('number_series')
                ->where('project_id', $pid)
                ->whereIn('document_type', ['SALE', 'BUDGET_MOVE'])
                ->update([
                    'next_number' => 1,
                    'last_reset_date' => null,
                    'updated_at' => date('Y-m-d H:i:s'),
                ]);

            // 7. ลบ number_series_logs ที่เกี่ยวข้อง
            if (!empty($sids)) {
                $db->table('number_series_logs')
                    ->whereIn('number_series_id', $sids)
                    ->delete();
            }

            $db->transCommit();

            return $this->response->setStatusCode(200)->setJSON([
                'message' => 'ล้างข้อมูลสำเร็จ',
                'summary' => [
                    'deleted_transaction_items' => $deletedItems,
                    'deleted_transactions' => $deletedTransactions,
                    'deleted_budget_movements' => $deletedMovements,
                    'deleted_budget_allocations' => $deletedAllocations,
                    'reset_units' => $resetUnits,
                ],
            ]);
        } catch (\Exception $e) {
            $db->transRollback();
            return $this->response->setStatusCode(500)->setJSON([
                'error' => 'เกิดข้อผิดพลาด: ' . $e->getMessage(),
            ]);
        }
    }
}
