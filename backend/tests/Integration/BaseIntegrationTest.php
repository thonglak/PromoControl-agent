<?php

namespace Tests\Integration;

use CodeIgniter\Test\CIUnitTestCase;
use CodeIgniter\Test\FeatureTestTrait;
use Config\Database;

/**
 * BaseIntegrationTest -- base class สำหรับ integration tests
 *
 * จัดการ:
 * - ปิด FK checks ก่อน truncate
 * - Truncate ตารางทั้งหมดในลำดับที่ถูกต้อง
 * - เปิด FK checks หลัง truncate
 */
abstract class BaseIntegrationTest extends CIUnitTestCase
{
    use FeatureTestTrait;

    /**
     * ล้างข้อมูลทุกตารางที่เกี่ยวข้องก่อนทุก test
     * ปิด FOREIGN_KEY_CHECKS เพื่อให้ truncate ได้
     */
    protected function cleanDatabase(): void
    {
        $db = Database::connect();

        $db->query('SET FOREIGN_KEY_CHECKS = 0');

        $tables = [
            'sales_transaction_items',
            'sales_transactions',
            'budget_movements',
            'unit_budget_allocations',
            'number_series_logs',
            'number_series',
            'promotion_item_units',
            'promotion_item_house_models',
            'promotion_item_master',
            'fee_rate_policies',
            'fee_formulas',
            'bottom_line_mapping_columns',
            'bottom_line_mappings',
            'bottom_lines',
            'import_config_columns',
            'import_configs',
            'project_units',
            'house_models',
            'user_projects',
            'refresh_tokens',
            'users',
            'projects',
        ];

        foreach ($tables as $table) {
            try {
                $db->table($table)->truncate();
            } catch (\Throwable $e) {
                // ข้ามถ้าตารางไม่มี (อาจไม่มีบาง migration)
            }
        }

        $db->query('SET FOREIGN_KEY_CHECKS = 1');
    }

    /**
     * Setup admin user + login แล้ว return access_token
     */
    protected function setupAdminAndLogin(
        string $email    = 'admin@test.promo',
        string $password = 'Admin@1234',
        string $name     = 'Admin ทดสอบ'
    ): string {
        $this->withBodyFormat('json')->post('api/auth/setup', [
            'email'    => $email,
            'password' => $password,
            'name'     => $name,
        ]);

        $loginResult = $this->withBodyFormat('json')->post('api/auth/login', [
            'email'    => $email,
            'password' => $password,
        ]);

        $json = json_decode($loginResult->getJSON(), true);
        return $json['access_token'];
    }

    /**
     * Return Authorization header array
     */
    protected function authHeaders(string $token): array
    {
        return ['Authorization' => "Bearer {$token}"];
    }
}
