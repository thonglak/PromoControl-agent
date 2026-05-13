<?php

namespace App\Controllers;

use App\Services\SystemSettingService;
use CodeIgniter\HTTP\ResponseInterface;
use RuntimeException;

/**
 * SystemSettingController — HTTP handlers สำหรับ /api/system-settings
 *
 * Endpoints:
 *  GET /api/system-settings              → list ทั้งหมด (logged-in user ทุก role อ่านได้)
 *  GET /api/system-settings/{key}        → get หนึ่ง key
 *  PUT /api/system-settings/{key}        → update (admin/manager)
 */
class SystemSettingController extends BaseController
{
    private SystemSettingService $service;

    public function __construct()
    {
        $this->service = new SystemSettingService();
    }

    private function userId(): int
    {
        return (int) ($this->request->user_id ?? 0);
    }

    public function index(): ResponseInterface
    {
        return $this->response->setStatusCode(200)->setJSON([
            'data' => $this->service->listAll(),
        ]);
    }

    public function show(string $key): ResponseInterface
    {
        $row = $this->service->get($key);
        if (!$row) {
            return $this->response->setStatusCode(404)->setJSON(['error' => 'ไม่พบค่าตั้งค่า']);
        }
        return $this->response->setStatusCode(200)->setJSON(['data' => $row]);
    }

    public function update(string $key): ResponseInterface
    {
        $body = $this->request->getJSON(true) ?? [];
        if (!array_key_exists('setting_value', $body)) {
            return $this->response->setStatusCode(422)->setJSON([
                'errors' => ['setting_value' => 'กรุณาระบุค่าที่ต้องการตั้ง'],
            ]);
        }

        // Validate ค่าตาม key ที่รู้จัก
        $value = $body['setting_value'];
        try {
            $value = $this->validateValue($key, $value);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(422)->setJSON(['error' => $e->getMessage()]);
        }

        try {
            $updated = $this->service->set($key, $value, $this->userId());
            return $this->response->setStatusCode(200)->setJSON([
                'message' => 'บันทึกค่าตั้งค่าสำเร็จ',
                'data'    => $updated,
            ]);
        } catch (RuntimeException $e) {
            return $this->response->setStatusCode(404)->setJSON(['error' => $e->getMessage()]);
        }
    }

    /** Validate ค่าตาม schema ของ key — โยน RuntimeException ถ้าไม่ถูก */
    private function validateValue(string $key, mixed $value): mixed
    {
        switch ($key) {
            case 'transfer_fee_percent':
                if (!is_numeric($value)) {
                    throw new RuntimeException('อัตรา % ค่าธรรมเนียมโอนต้องเป็นตัวเลข');
                }
                $v = (float) $value;
                if ($v < 0 || $v >= 100) {
                    throw new RuntimeException('อัตรา % ต้องอยู่ในช่วง 0 ถึง น้อยกว่า 100');
                }
                return $v;
            default:
                // unknown key — ปฏิเสธ (ไม่ใช่ key ที่ระบบรองรับ)
                throw new RuntimeException("ไม่รองรับการตั้งค่า key: {$key}");
        }
    }
}
