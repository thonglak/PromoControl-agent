<?php

namespace App\Controllers;

use CodeIgniter\HTTP\ResponseInterface;
use CodeIgniter\RESTful\ResourceController;

/**
 * Monitor Links — admin จัดการลิงค์สาธารณะ
 *
 * - 1 ลิงค์ = N projects (M:N ผ่าน monitor_link_projects)
 * - admin only (route filter)
 * - public access ผ่าน PublicMonitorController::show()
 */
class MonitorLinkController extends ResourceController
{
    private function db(): \CodeIgniter\Database\BaseConnection
    {
        return \Config\Database::connect();
    }

    private function userId(): int { return (int) ($this->request->user_id ?? 0); }

    /**
     * GET /api/monitor-links → list ทั้งหมด พร้อม project list ในแต่ละลิงค์
     */
    public function index(): ResponseInterface
    {
        $links = $this->db()->table('monitor_links ml')
            ->select('ml.id, ml.token, ml.name, ml.created_at, ml.updated_at, u.name AS created_by_name')
            ->join('users u', 'u.id = ml.created_by', 'left')
            ->orderBy('ml.created_at', 'DESC')
            ->get()->getResultArray();

        if (empty($links)) {
            return $this->respond(['data' => []]);
        }

        $ids = array_map(static fn($l) => (int) $l['id'], $links);
        $pivot = $this->db()->table('monitor_link_projects mlp')
            ->select('mlp.monitor_link_id, mlp.project_id, p.code AS project_code, p.name AS project_name')
            ->join('projects p', 'p.id = mlp.project_id', 'left')
            ->whereIn('mlp.monitor_link_id', $ids)
            ->get()->getResultArray();

        $byLink = [];
        foreach ($pivot as $row) {
            $lid = (int) $row['monitor_link_id'];
            $byLink[$lid][] = [
                'project_id'   => (int) $row['project_id'],
                'project_code' => $row['project_code'],
                'project_name' => $row['project_name'],
            ];
        }

        foreach ($links as &$l) {
            $l['id']       = (int) $l['id'];
            $l['projects'] = $byLink[$l['id']] ?? [];
        }
        unset($l);

        return $this->respond(['data' => $links]);
    }

    /**
     * POST /api/monitor-links → สร้างลิงค์ใหม่
     * body: { name: string, project_ids: number[] }
     */
    public function create(): ResponseInterface
    {
        $body = $this->request->getJSON(true) ?? [];
        $name = trim((string) ($body['name'] ?? ''));
        $projectIds = array_values(array_unique(array_map('intval', $body['project_ids'] ?? [])));

        $errors = [];
        if ($name === '') $errors['name'] = 'กรุณาตั้งชื่อลิงค์';
        if (strlen($name) > 100) $errors['name'] = 'ชื่อต้องไม่เกิน 100 ตัวอักษร';
        if (empty($projectIds)) $errors['project_ids'] = 'กรุณาเลือกอย่างน้อย 1 โครงการ';
        if (!empty($errors)) {
            return $this->failValidationErrors($errors);
        }

        // verify all project_ids exist
        $existing = $this->db()->table('projects')
            ->select('id')
            ->whereIn('id', $projectIds)
            ->get()->getResultArray();
        $existingIds = array_map(static fn($p) => (int) $p['id'], $existing);
        $invalidIds = array_diff($projectIds, $existingIds);
        if (!empty($invalidIds)) {
            return $this->failValidationErrors(['project_ids' => 'พบโครงการที่ไม่มีในระบบ: ' . implode(',', $invalidIds)]);
        }

        $token = bin2hex(random_bytes(32));
        $now = date('Y-m-d H:i:s');

        $this->db()->transBegin();
        try {
            $this->db()->table('monitor_links')->insert([
                'token'      => $token,
                'name'       => $name,
                'created_by' => $this->userId() ?: null,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $linkId = (int) $this->db()->insertID();

            $pivotRows = array_map(static fn($pid) => [
                'monitor_link_id' => $linkId,
                'project_id'      => $pid,
            ], $existingIds);
            $this->db()->table('monitor_link_projects')->insertBatch($pivotRows);

            $this->db()->transCommit();
        } catch (\Throwable $e) {
            $this->db()->transRollback();
            return $this->failServerError('สร้างลิงค์ไม่สำเร็จ: ' . $e->getMessage());
        }

        return $this->respondCreated([
            'id'    => $linkId,
            'token' => $token,
            'name'  => $name,
            'projects' => $existingIds,
        ]);
    }

    /**
     * PUT /api/monitor-links/{id} → update name + project_ids (ไม่เปลี่ยน token)
     */
    public function update($id = null): ResponseInterface
    {
        $linkId = (int) $id;
        $link = $this->db()->table('monitor_links')->where('id', $linkId)->get()->getRowArray();
        if (!$link) return $this->failNotFound('ไม่พบลิงค์');

        $body = $this->request->getJSON(true) ?? [];
        $name = trim((string) ($body['name'] ?? $link['name']));
        $projectIds = isset($body['project_ids'])
            ? array_values(array_unique(array_map('intval', $body['project_ids'])))
            : null;

        $errors = [];
        if ($name === '') $errors['name'] = 'กรุณาตั้งชื่อลิงค์';
        if (strlen($name) > 100) $errors['name'] = 'ชื่อต้องไม่เกิน 100 ตัวอักษร';
        if ($projectIds !== null && empty($projectIds)) {
            $errors['project_ids'] = 'กรุณาเลือกอย่างน้อย 1 โครงการ';
        }
        if (!empty($errors)) {
            return $this->failValidationErrors($errors);
        }

        $existingIds = null;
        if ($projectIds !== null) {
            $existing = $this->db()->table('projects')
                ->select('id')
                ->whereIn('id', $projectIds)
                ->get()->getResultArray();
            $existingIds = array_map(static fn($p) => (int) $p['id'], $existing);
            $invalid = array_diff($projectIds, $existingIds);
            if (!empty($invalid)) {
                return $this->failValidationErrors(['project_ids' => 'พบโครงการที่ไม่มีในระบบ: ' . implode(',', $invalid)]);
            }
        }

        $this->db()->transBegin();
        try {
            $this->db()->table('monitor_links')->where('id', $linkId)->update([
                'name'       => $name,
                'updated_at' => date('Y-m-d H:i:s'),
            ]);

            if ($existingIds !== null) {
                $this->db()->table('monitor_link_projects')->where('monitor_link_id', $linkId)->delete();
                $rows = array_map(static fn($pid) => [
                    'monitor_link_id' => $linkId,
                    'project_id'      => $pid,
                ], $existingIds);
                $this->db()->table('monitor_link_projects')->insertBatch($rows);
            }

            $this->db()->transCommit();
        } catch (\Throwable $e) {
            $this->db()->transRollback();
            return $this->failServerError('แก้ไขไม่สำเร็จ: ' . $e->getMessage());
        }

        return $this->respond(['message' => 'แก้ไขลิงค์เรียบร้อย']);
    }

    /**
     * DELETE /api/monitor-links/{id} → ลบลิงค์ (CASCADE pivot)
     */
    public function delete($id = null): ResponseInterface
    {
        $linkId = (int) $id;
        $link = $this->db()->table('monitor_links')->where('id', $linkId)->get()->getRowArray();
        if (!$link) return $this->failNotFound('ไม่พบลิงค์');

        $this->db()->table('monitor_links')->where('id', $linkId)->delete();
        return $this->respond(['message' => 'ลบลิงค์เรียบร้อย']);
    }
}
