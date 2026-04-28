<?php

namespace Tests\Integration;

use Config\Database;

/**
 * HouseModelTest -- Integration tests สำหรับ /api/house-models endpoints
 *
 * ทดสอบ CRUD: create, list filtered by project, detail, update,
 * delete without units, delete with units (ต้อง reject)
 */
final class HouseModelTest extends BaseIntegrationTest
{
    private string $token     = '';
    private int    $projectId = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->cleanDatabase();

        $this->token = $this->setupAdminAndLogin('hmadmin@promo.test');

        // สร้าง project สำหรับทดสอบ
        $projResult = $this->withHeaders($this->authHeaders($this->token))
                           ->withBodyFormat('json')
                           ->post('api/projects', [
                               'code'         => 'PJ-HM',
                               'name'         => 'โครงการสำหรับ HouseModel Test',
                               'project_type' => 'house',
                           ]);
        $projJson       = json_decode($projResult->getJSON(), true);
        $this->projectId = (int) $projJson['data']['id'];
    }

    /**
     * Helper: สร้าง house model ผ่าน API
     */
    private function createHouseModel(string $code = 'HM-A', string $name = 'แบบบ้าน A'): array
    {
        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->withBodyFormat('json')
                       ->post('api/house-models', [
                           'project_id' => $this->projectId,
                           'code'       => $code,
                           'name'       => $name,
                           'area_sqm'   => 150.5,
                           'bedrooms'   => 3,
                           'bathrooms'  => 2,
                           'floors'     => 2,
                       ]);

        return json_decode($result->getJSON(), true);
    }

    // ────────────────────────────────────────────────────────────────
    // 1. POST /api/house-models -- create
    // ────────────────────────────────────────────────────────────────

    public function testCreateHouseModelSucceeds(): void
    {
        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->withBodyFormat('json')
                       ->post('api/house-models', [
                           'project_id' => $this->projectId,
                           'code'       => 'HM-001',
                           'name'       => 'แบบบ้าน วิลล่า',
                           'area_sqm'   => 200.0,
                           'bedrooms'   => 4,
                           'bathrooms'  => 3,
                           'floors'     => 2,
                       ]);

        $result->assertStatus(201);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('data', $json);
        $this->assertEquals('HM-001', $json['data']['code']);
        $this->assertEquals('แบบบ้าน วิลล่า', $json['data']['name']);
        $this->assertEquals($this->projectId, (int) $json['data']['project_id']);
    }

    // ────────────────────────────────────────────────────────────────
    // 2. GET /api/house-models?project_id= -- list filtered by project
    // ────────────────────────────────────────────────────────────────

    public function testListHouseModelsFilteredByProject(): void
    {
        $this->createHouseModel('HM-LST1', 'แบบบ้าน 1');
        $this->createHouseModel('HM-LST2', 'แบบบ้าน 2');

        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->get("api/house-models?project_id={$this->projectId}");

        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('data', $json);
        $this->assertCount(2, $json['data']);
    }

    // ────────────────────────────────────────────────────────────────
    // 3. GET /api/house-models/:id -- detail
    // ────────────────────────────────────────────────────────────────

    public function testShowHouseModelDetail(): void
    {
        $created = $this->createHouseModel('HM-SHW', 'แบบบ้านดูรายละเอียด');
        $modelId = $created['data']['id'];

        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->get("api/house-models/{$modelId}");

        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('data', $json);
        $this->assertEquals('HM-SHW', $json['data']['code']);
        $this->assertArrayHasKey('unit_summary', $json['data']);
    }

    // ────────────────────────────────────────────────────────────────
    // 4. PUT /api/house-models/:id -- update
    // ────────────────────────────────────────────────────────────────

    public function testUpdateHouseModelSucceeds(): void
    {
        $created = $this->createHouseModel('HM-UPD', 'แบบบ้านก่อนอัปเดต');
        $modelId = $created['data']['id'];

        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->withBodyFormat('json')
                       ->put("api/house-models/{$modelId}", [
                           'code'     => 'HM-UPD',
                           'name'     => 'แบบบ้านหลังอัปเดต',
                           'area_sqm' => 180.0,
                       ]);

        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);
        $this->assertEquals('แบบบ้านหลังอัปเดต', $json['data']['name']);
    }

    // ────────────────────────────────────────────────────────────────
    // 5. DELETE /api/house-models/:id -- no units ต้องลบสำเร็จ
    // ────────────────────────────────────────────────────────────────

    public function testDeleteHouseModelWithoutUnitsSucceeds(): void
    {
        $created = $this->createHouseModel('HM-DEL', 'แบบบ้านลบ');
        $modelId = $created['data']['id'];

        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->delete("api/house-models/{$modelId}");

        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('message', $json);

        // ตรวจว่าถูกลบจริง
        $showResult = $this->withHeaders($this->authHeaders($this->token))
                           ->get("api/house-models/{$modelId}");
        $showResult->assertStatus(404);
    }

    // ────────────────────────────────────────────────────────────────
    // 6. DELETE /api/house-models/:id -- with units ต้อง reject (400)
    // ────────────────────────────────────────────────────────────────

    public function testDeleteHouseModelWithUnitsReturnsError(): void
    {
        $created = $this->createHouseModel('HM-NDL', 'แบบบ้านลบไม่ได้');
        $modelId = $created['data']['id'];

        // สร้าง unit ที่อ้างอิง house_model นี้
        $db = Database::connect();
        $db->table('project_units')->insert([
            'project_id'      => $this->projectId,
            'house_model_id'  => $modelId,
            'unit_code'       => 'U-HM-001',
            'unit_number'     => '001',
            'base_price'      => 3000000,
            'unit_cost'       => 2500000,
            'standard_budget' => 100000,
            'status'          => 'available',
            'created_at'      => date('Y-m-d H:i:s'),
            'updated_at'      => date('Y-m-d H:i:s'),
        ]);

        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->delete("api/house-models/{$modelId}");

        $result->assertStatus(400);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('error', $json);
    }

    // ────────────────────────────────────────────────────────────────
    // เพิ่มเติม: list ต้อง require project_id
    // ────────────────────────────────────────────────────────────────

    public function testListHouseModelsWithoutProjectIdReturns400(): void
    {
        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->get('api/house-models');

        $result->assertStatus(400);
    }
}
