<?php

namespace App\Controllers;

use App\Services\PromotionValueSourceService;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * PromotionValueSourceController — จัดการแหล่งข้อมูลค่ารายยูนิต (value_mode=unit_table)
 *
 * ทุก endpoint จำกัดสิทธิ์ระดับ admin (filter role:admin ที่ route)
 */
class PromotionValueSourceController extends BaseController
{
    private PromotionValueSourceService $service;

    public function __construct()
    {
        $this->service = new PromotionValueSourceService();
    }

    // GET /api/promotion-value-sources
    public function index(): ResponseInterface
    {
        return $this->response->setStatusCode(200)
            ->setJSON(['data' => $this->service->getAll()]);
    }

    // POST /api/promotion-value-sources
    public function create(): ResponseInterface
    {
        $body = $this->request->getJSON(true) ?? [];
        try {
            return $this->response->setStatusCode(201)
                ->setJSON(['data' => $this->service->create($body)]);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    // PUT /api/promotion-value-sources/{id}
    public function update(int $id): ResponseInterface
    {
        $body = $this->request->getJSON(true) ?? [];
        try {
            return $this->response->setStatusCode(200)
                ->setJSON(['data' => $this->service->update($id, $body)]);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    // DELETE /api/promotion-value-sources/{id}
    public function delete(int $id): ResponseInterface
    {
        try {
            $this->service->delete($id);
            return $this->response->setStatusCode(200)
                ->setJSON(['message' => 'ลบแหล่งข้อมูลเรียบร้อย']);
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }
}
