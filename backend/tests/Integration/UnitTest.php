<?php

namespace Tests\Integration;

use Config\Database;

/**
 * UnitTest -- Integration tests สำหรับ /api/units endpoints
 *
 * ทดสอบ CRUD: create, list filtered, detail with budget info, update,
 * delete without transactions, delete with transactions (ต้อง reject)
 */
final class UnitTest extends BaseIntegrationTest
{
    private string $token        = '';
    private int    $projectId    = 0;
    private int    $houseModelId = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->cleanDatabase();

        $this->token = $this->setupAdminAndLogin('unitadmin@promo.test');

        // สร้าง project
        $projResult = $this->withHeaders($this->authHeaders($this->token))
                           ->withBodyFormat('json')
                           ->post('api/projects', [
                               'code'         => 'PJ-UNIT',
                               'name'         => 'โครงการสำหรับ Unit Test',
                               'project_type' => 'house',
                           ]);
        $projJson        = json_decode($projResult->getJSON(), true);
        $this->projectId = (int) $projJson['data']['id'];

        // สร้าง house model
        $hmResult = $this->withHeaders($this->authHeaders($this->token))
                         ->withBodyFormat('json')
                         ->post('api/house-models', [
                             'project_id' => $this->projectId,
                             'code'       => 'HM-UNIT',
                             'name'       => 'แบบบ้านสำหรับ Unit Test',
                             'area_sqm'   => 120.0,
                         ]);
        $hmJson = json_decode($hmResult->getJSON(), true);
        $this->houseModelId = (int) $hmJson['data']['id'];
    }

    /**
     * Helper: สร้าง unit ผ่าน API
     */
    private function createUnit(string $unitCode = 'U-001', string $unitNumber = 'A-001'): array
    {
        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->withBodyFormat('json')
                       ->post('api/units', [
                           'project_id'      => $this->projectId,
                           'house_model_id'  => $this->houseModelId,
                           'unit_code'       => $unitCode,
                           'unit_number'     => $unitNumber,
                           'base_price'      => 3000000,
                           'unit_cost'       => 2500000,
                           'standard_budget' => 100000,
                       ]);

        return json_decode($result->getJSON(), true);
    }

    // ────────────────────────────────────────────────────────────────
    // 1. POST /api/units -- create unit
    // ────────────────────────────────────────────────────────────────

    public function testCreateUnitSucceeds(): void
    {
        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->withBodyFormat('json')
                       ->post('api/units', [
                           'project_id'      => $this->projectId,
                           'house_model_id'  => $this->houseModelId,
                           'unit_code'       => 'U-CREATE',
                           'unit_number'     => 'B-101',
                           'base_price'      => 3500000,
                           'unit_cost'       => 2800000,
                           'standard_budget' => 150000,
                       ]);

        $result->assertStatus(201);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('data', $json);
        $this->assertEquals('U-CREATE', $json['data']['unit_code']);
        $this->assertEquals('B-101', $json['data']['unit_number']);
        $this->assertEquals($this->projectId, (int) $json['data']['project_id']);
        $this->assertEquals($this->houseModelId, (int) $json['data']['house_model_id']);
    }

    // ────────────────────────────────────────────────────────────────
    // 2. GET /api/units?project_id= -- list filtered
    // ────────────────────────────────────────────────────────────────

    public function testListUnitsFilteredByProject(): void
    {
        $this->createUnit('U-LST1', 'A-101');
        $this->createUnit('U-LST2', 'A-102');

        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->get("api/units?project_id={$this->projectId}");

        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('data', $json);
        $this->assertCount(2, $json['data']);
    }

    // ────────────────────────────────────────────────────────────────
    // 3. GET /api/units/:id -- detail with budget info
    // ────────────────────────────────────────────────────────────────

    public function testShowUnitDetailWithBudgetInfo(): void
    {
        $created = $this->createUnit('U-SHW', 'A-201');
        $unitId  = $created['data']['id'];

        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->get("api/units/{$unitId}");

        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('data', $json);
        $this->assertEquals('U-SHW', $json['data']['unit_code']);

        // ต้องมี budget_summary ตาม controller
        $this->assertArrayHasKey('budget_summary', $json['data']);
        $this->assertArrayHasKey('standard_budget', $json['data']['budget_summary']);
        $this->assertArrayHasKey('budget_used', $json['data']['budget_summary']);
        $this->assertArrayHasKey('budget_remaining', $json['data']['budget_summary']);
    }

    // ────────────────────────────────────────────────────────────────
    // 4. PUT /api/units/:id -- update
    // ────────────────────────────────────────────────────────────────

    public function testUpdateUnitSucceeds(): void
    {
        $created = $this->createUnit('U-UPD', 'A-301');
        $unitId  = $created['data']['id'];

        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->withBodyFormat('json')
                       ->put("api/units/{$unitId}", [
                           'unit_code'   => 'U-UPD',
                           'unit_number' => 'A-301',
                           'base_price'  => 3200000,
                           'unit_cost'   => 2600000,
                           'remark'      => 'อัปเดตราคา',
                       ]);

        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('data', $json);
        $this->assertEquals(3200000, (float) $json['data']['base_price']);
    }

    // ────────────────────────────────────────────────────────────────
    // 5. DELETE /api/units/:id -- no transactions ต้องลบสำเร็จ
    // ────────────────────────────────────────────────────────────────

    public function testDeleteUnitWithoutTransactionsSucceeds(): void
    {
        $created = $this->createUnit('U-DEL', 'A-401');
        $unitId  = $created['data']['id'];

        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->delete("api/units/{$unitId}");

        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('message', $json);

        // ตรวจว่าถูกลบจริง
        $showResult = $this->withHeaders($this->authHeaders($this->token))
                           ->get("api/units/{$unitId}");
        $showResult->assertStatus(404);
    }

    // ────────────────────────────────────────────────────────────────
    // เพิ่มเติม: delete unit ที่มี sales_transactions ต้อง reject
    // ────────────────────────────────────────────────────────────────

    public function testDeleteUnitWithSalesTransactionsReturnsError(): void
    {
        $created = $this->createUnit('U-NDL', 'A-501');
        $unitId  = $created['data']['id'];

        $db = Database::connect();
        $db->table('sales_transactions')->insert([
            'sale_no'               => 'TX-UNIT-001',
            'project_id'            => $this->projectId,
            'unit_id'               => $unitId,
            'base_price'            => 3000000,
            'unit_cost'             => 2500000,
            'net_price'             => 2950000,
            'total_cost'            => 2500000,
            'profit'                => 450000,
            'total_discount'        => 50000,
            'total_promo_cost'      => 0,
            'total_expense_support' => 0,
            'customer_name'         => 'ลูกค้าทดสอบ',
            'salesperson'           => 'พนักงานทดสอบ',
            'sale_date'             => date('Y-m-d'),
            'status'                => 'active',
            'created_by'            => 1,
            'created_at'            => date('Y-m-d H:i:s'),
            'updated_at'            => date('Y-m-d H:i:s'),
        ]);

        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->delete("api/units/{$unitId}");

        $result->assertStatus(400);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('error', $json);
    }

    // ────────────────────────────────────────────────────────────────
    // เพิ่มเติม: list ต้อง require project_id
    // ────────────────────────────────────────────────────────────────

    public function testListUnitsWithoutProjectIdReturns400(): void
    {
        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->get('api/units');

        $result->assertStatus(400);
    }

    // ────────────────────────────────────────────────────────────────
    // เพิ่มเติม: create unit with duplicate code ต้อง reject
    // ────────────────────────────────────────────────────────────────

    public function testCreateUnitDuplicateCodeReturnsError(): void
    {
        $this->createUnit('U-DUP', 'A-601');

        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->withBodyFormat('json')
                       ->post('api/units', [
                           'project_id'      => $this->projectId,
                           'house_model_id'  => $this->houseModelId,
                           'unit_code'       => 'U-DUP',
                           'unit_number'     => 'A-602',
                           'base_price'      => 3000000,
                           'unit_cost'       => 2500000,
                       ]);

        $result->assertStatus(400);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('errors', $json);
        $this->assertArrayHasKey('unit_code', $json['errors']);
    }
}
