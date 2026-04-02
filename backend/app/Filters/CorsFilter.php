<?php

namespace App\Filters;

use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;
use CodeIgniter\Filters\FilterInterface;

/**
 * ตัวกรอง CORS — อนุญาต request จาก origin ที่กำหนด
 * รองรับ preflight OPTIONS request จาก Angular dev server
 */
class CorsFilter implements FilterInterface
{
    public function before(RequestInterface $request, $arguments = null)
    {
        // ตอบ preflight OPTIONS request ทันทีโดยไม่ต้องผ่าน controller
        if ($request->getMethod() === 'options') {
            $response = service('response');
            $this->addCorsHeaders($response);
            $response->setStatusCode(204);
            return $response;
        }
    }

    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null)
    {
        $this->addCorsHeaders($response);
    }

    /**
     * เพิ่ม CORS headers ให้ response
     */
    private function addCorsHeaders(ResponseInterface $response): void
    {
        $response->setHeader('Access-Control-Allow-Origin', 'http://localhost:8080');
        $response->setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        $response->setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        $response->setHeader('Access-Control-Allow-Credentials', 'true');
    }
}
