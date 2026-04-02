<?php

namespace App\Database\Seeds;

use CodeIgniter\Database\Seeder;
use App\Services\ProjectService;

/**
 * NumberSeriesSeeder
 *
 * ไม่ได้ seed ข้อมูลโดยตรง — number_series สร้างอัตโนมัติเมื่อสร้างโครงการ
 * ดูตรรกะที่ ProjectService::initDefaultNumberSeries()
 *
 * วิธีใช้งาน:
 *   // เมื่อสร้างโครงการใหม่ใน Controller หรือ Service อื่น:
 *   $projectService = new \App\Services\ProjectService();
 *   $projectService->initDefaultNumberSeries($projectId, $currentUserId);
 *
 * Default config (4 series ต่อ project):
 *   SALE       → SO-2569-0001  (รีเซ็ตรายปี พ.ศ.)
 *   BUDGET_MOVE → BM-2569-0001  (รีเซ็ตรายปี พ.ศ.)
 *   BOTTOM_LINE → BL-2569-0001  (รีเซ็ตรายปี พ.ศ.)
 *   UNIT_ALLOC  → UA-2569-0001  (รีเซ็ตรายปี พ.ศ.)
 */
class NumberSeriesSeeder extends Seeder
{
    /**
     * run() ไม่ทำอะไร — ดู DemoSeeder หรือ ProjectService แทน
     * ระบบจะสร้าง number_series ให้อัตโนมัติทุกครั้งที่สร้างโครงการ
     */
    public function run(): void
    {
        // ไม่ seed โดยตรง — business rule: auto-create ผ่าน ProjectService::initDefaultNumberSeries()
    }

    /**
     * Helper: สร้าง number_series สำหรับ project ที่ระบุ
     * ใช้ใน DemoSeeder หรือ unit test
     */
    public function createForProject(int $projectId, ?int $createdBy = null): void
    {
        $service = new ProjectService();
        $service->initDefaultNumberSeries($projectId, $createdBy);
    }
}
