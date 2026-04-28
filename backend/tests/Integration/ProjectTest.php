<?php

namespace Tests\Integration;

use Config\Database;

/**
 * ProjectTest -- Integration tests สำหรับ /api/projects endpoints
 *
 * ทดสอบ CRUD, auth/role, validation, soft-delete, sub-endpoints
 */
final class ProjectTest extends BaseIntegrationTest
{
    private string $token = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->cleanDatabase();
        $this->token = $this->setupAdminAndLogin('projadmin@promo.test');
    }

    /**
     * Helper: สร้าง project ผ่าน API
     */
    private function createProject(string $code = 'PJ-TEST', string $name = 'โครงการทดสอบ'): array
    {
        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->withBodyFormat('json')
                       ->post('api/projects', [
                           'code'              => $code,
                           'name'              => $name,
                           'project_type'      => 'house',
                           'approval_required' => false,
                           'pool_budget_amount' => 1000000,
                       ]);

        return json_decode($result->getJSON(), true);
    }

    /**
     * Helper: สร้าง user ด้วย role ที่กำหนด แล้ว login คืน access_token
     */
    private function setupUserAndLogin(string $email, string $role): string
    {
        // สร้าง user ผ่าน admin API
        $this->withHeaders($this->authHeaders($this->token))
             ->withBodyFormat('json')
             ->post('api/users', [
                 'email'    => $email,
                 'password' => 'Test@1234',
                 'name'     => "User {$role}",
                 'role'     => $role,
             ]);

        // login ด้วย user ที่สร้าง
        $loginResult = $this->withBodyFormat('json')->post('api/auth/login', [
            'email'    => $email,
            'password' => 'Test@1234',
        ]);

        $json = json_decode($loginResult->getJSON(), true);
        return $json['access_token'];
    }

    // ════════════════════════════════════════════════════════════════
    // 1. GET /api/projects -- list (empty initially)
    // ════════════════════════════════════════════════════════════════

    /** ทดสอบ list ว่างเริ่มต้น + pagination meta */
    public function testListProjectsEmptyInitially(): void
    {
        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->get('api/projects');

        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('data', $json);
        $this->assertCount(0, $json['data']);
        // ตรวจ pagination meta
        $this->assertArrayHasKey('meta', $json);
        $this->assertEquals(0, $json['meta']['total']);
        $this->assertEquals(1, $json['meta']['page']);
    }

    // ════════════════════════════════════════════════════════════════
    // 2. POST /api/projects -- create project (valid data)
    // ════════════════════════════════════════════════════════════════

    public function testCreateProjectSucceeds(): void
    {
        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->withBodyFormat('json')
                       ->post('api/projects', [
                           'code'              => 'PJ-001',
                           'name'              => 'The Garden Residence',
                           'project_type'      => 'house',
                           'description'       => 'โครงการบ้านเดี่ยว',
                           'approval_required' => true,
                           'pool_budget_amount' => 500000,
                       ]);

        $result->assertStatus(201);
        $json = json_decode($result->getJSON(), true);

        $this->assertArrayHasKey('message', $json);
        $this->assertArrayHasKey('data', $json);
        $this->assertEquals('PJ-001', $json['data']['code']);
        $this->assertEquals('The Garden Residence', $json['data']['name']);
        $this->assertEquals('house', $json['data']['project_type']);
        $this->assertEquals('active', $json['data']['status']);
    }

    // ════════════════════════════════════════════════════════════════
    // 3. POST /api/projects -- duplicate code ต้อง 422
    // ════════════════════════════════════════════════════════════════

    public function testCreateProjectDuplicateCodeReturns422(): void
    {
        $this->createProject('DUP-001', 'โครงการแรก');

        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->withBodyFormat('json')
                       ->post('api/projects', [
                           'code'         => 'DUP-001',
                           'name'         => 'โครงการซ้ำ',
                           'project_type' => 'condo',
                       ]);

        $result->assertStatus(422);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('errors', $json);
        $this->assertArrayHasKey('code', $json['errors']);
    }

    // ════════════════════════════════════════════════════════════════
    // 4. GET /api/projects/:id -- get detail
    // ════════════════════════════════════════════════════════════════

    public function testShowProjectDetail(): void
    {
        $created   = $this->createProject('PJ-SHOW', 'โครงการดูรายละเอียด');
        $projectId = $created['data']['id'];

        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->get("api/projects/{$projectId}");

        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('data', $json);
        $this->assertEquals('PJ-SHOW', $json['data']['code']);
        $this->assertArrayHasKey('unit_count', $json['data']);
        // ตรวจ budget_used field ด้วย
        $this->assertArrayHasKey('budget_used', $json['data']);
        $this->assertEquals(0, $json['data']['budget_used']);
    }

    // ════════════════════════════════════════════════════════════════
    // 5. PUT /api/projects/:id -- update
    // ════════════════════════════════════════════════════════════════

    public function testUpdateProjectSucceeds(): void
    {
        $created   = $this->createProject('PJ-UPD', 'โครงการอัปเดต');
        $projectId = $created['data']['id'];

        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->withBodyFormat('json')
                       ->put("api/projects/{$projectId}", [
                           'name'   => 'โครงการอัปเดตแล้ว',
                           'status' => 'completed',
                       ]);

        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);
        $this->assertEquals('โครงการอัปเดตแล้ว', $json['data']['name']);
        $this->assertEquals('completed', $json['data']['status']);
    }

    // ════════════════════════════════════════════════════════════════
    // 6. DELETE /api/projects/:id -- soft-delete สำเร็จ (ไม่มี sales/units)
    // ════════════════════════════════════════════════════════════════

    /** ทดสอบ soft-delete: status เปลี่ยนเป็น inactive, record ยังอยู่ใน DB */
    public function testDeleteProjectWithoutSalesSucceeds(): void
    {
        $created   = $this->createProject('PJ-DEL', 'โครงการลบ');
        $projectId = $created['data']['id'];

        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->delete("api/projects/{$projectId}");

        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('message', $json);

        // ตรวจว่า record ยังอยู่ใน DB แต่ status เป็น inactive
        $db = Database::connect();
        $row = $db->table('projects')->where('id', $projectId)->get()->getRowArray();
        $this->assertNotNull($row, 'Project record ควรยังอยู่ใน DB หลัง soft-delete');
        $this->assertEquals('inactive', $row['status']);
    }

    // ════════════════════════════════════════════════════════════════
    // 7. DELETE /api/projects/:id -- with sales transactions ต้อง reject
    // ════════════════════════════════════════════════════════════════

    public function testDeleteProjectWithSalesTransactionsReturnsError(): void
    {
        $created   = $this->createProject('PJ-NODL', 'โครงการที่ลบไม่ได้');
        $projectId = $created['data']['id'];

        $db = Database::connect();
        $unitId = $db->table('project_units')->insert([
            'project_id'      => $projectId,
            'unit_code'       => 'U-NODL-001',
            'unit_number'     => '001',
            'base_price'      => 3000000,
            'unit_cost'       => 2500000,
            'standard_budget' => 100000,
            'status'          => 'available',
            'created_at'      => date('Y-m-d H:i:s'),
            'updated_at'      => date('Y-m-d H:i:s'),
        ]);
        $unitId = $db->insertID();

        $db->table('sales_transactions')->insert([
            'sale_no'               => 'TX-TEST-001',
            'project_id'            => $projectId,
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
                       ->delete("api/projects/{$projectId}");

        $result->assertStatus(400);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('error', $json);
    }

    // ════════════════════════════════════════════════════════════════
    // 8. List after create -- ตรวจ pagination meta + data
    // ════════════════════════════════════════════════════════════════

    public function testListProjectsAfterCreate(): void
    {
        $this->createProject('PJ-LST', 'โครงการทดสอบ List');

        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->get('api/projects');

        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);
        $this->assertCount(1, $json['data']);
        $this->assertEquals('PJ-LST', $json['data'][0]['code']);
        // ตรวจ pagination meta
        $this->assertArrayHasKey('meta', $json);
        $this->assertEquals(1, $json['meta']['total']);
        $this->assertEquals(1, $json['meta']['page']);
    }

    // ════════════════════════════════════════════════════════════════
    // CRITICAL: Auth tests — unauthenticated access
    // ════════════════════════════════════════════════════════════════

    /** เรียก GET /api/projects โดยไม่ส่ง token → 401 */
    public function testUnauthenticatedAccessReturns401(): void
    {
        $result = $this->get('api/projects');
        $result->assertStatus(401);
    }

    // ════════════════════════════════════════════════════════════════
    // CRITICAL: Role-based authorization tests
    // ════════════════════════════════════════════════════════════════

    /** Sales role ไม่สามารถสร้างโครงการได้ (POST ต้อง admin,manager) */
    public function testSalesRoleCannotCreateProject(): void
    {
        $salesToken = $this->setupUserAndLogin('sales@promo.test', 'sales');

        $result = $this->withHeaders($this->authHeaders($salesToken))
                       ->withBodyFormat('json')
                       ->post('api/projects', [
                           'code'         => 'PJ-SALES',
                           'name'         => 'โครงการจาก sales',
                           'project_type' => 'house',
                       ]);

        $result->assertStatus(403);
    }

    /** Sales role ไม่สามารถอัปเดตโครงการได้ */
    public function testSalesRoleCannotUpdateProject(): void
    {
        $created   = $this->createProject('PJ-SALEUPD', 'โครงการทดสอบ');
        $projectId = $created['data']['id'];

        $salesToken = $this->setupUserAndLogin('sales2@promo.test', 'sales');

        $result = $this->withHeaders($this->authHeaders($salesToken))
                       ->withBodyFormat('json')
                       ->put("api/projects/{$projectId}", [
                           'name' => 'แก้ไขจาก sales',
                       ]);

        $result->assertStatus(403);
    }

    /** Manager role ไม่สามารถลบโครงการได้ (DELETE ต้อง admin เท่านั้น) */
    public function testManagerRoleCannotDeleteProject(): void
    {
        $created   = $this->createProject('PJ-MGRDEL', 'โครงการทดสอบ');
        $projectId = $created['data']['id'];

        $mgrToken = $this->setupUserAndLogin('manager@promo.test', 'manager');

        $result = $this->withHeaders($this->authHeaders($mgrToken))
                       ->delete("api/projects/{$projectId}");

        $result->assertStatus(403);
    }

    /** Viewer role ไม่สามารถสร้างโครงการได้ */
    public function testViewerRoleCannotCreateProject(): void
    {
        $viewerToken = $this->setupUserAndLogin('viewer@promo.test', 'viewer');

        $result = $this->withHeaders($this->authHeaders($viewerToken))
                       ->withBodyFormat('json')
                       ->post('api/projects', [
                           'code'         => 'PJ-VIEWER',
                           'name'         => 'โครงการจาก viewer',
                           'project_type' => 'house',
                       ]);

        $result->assertStatus(403);
    }

    // ════════════════════════════════════════════════════════════════
    // CRITICAL: Project isolation (non-admin ไม่เห็น project ของคนอื่น)
    // ════════════════════════════════════════════════════════════════

    /** Non-admin user ไม่ควรเห็น project ที่ไม่ได้ assign ให้ */
    public function testNonAdminCannotSeeOtherUsersProject(): void
    {
        // สร้าง 2 projects
        $projectA = $this->createProject('PJ-ISOA', 'โครงการ A');
        $projectB = $this->createProject('PJ-ISOB', 'โครงการ B');

        // สร้าง manager user (ไม่ assign project ใดเลย)
        $mgrToken = $this->setupUserAndLogin('mgr-iso@promo.test', 'manager');

        // manager ไม่ควรเห็น project ใน list (ไม่ได้ assign)
        $result = $this->withHeaders($this->authHeaders($mgrToken))
                       ->get('api/projects');

        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);
        $this->assertCount(0, $json['data'], 'Non-admin ที่ไม่ได้ assign project ไม่ควรเห็น project ใด');

        // manager ไม่ควร access project detail ได้
        $resultDetail = $this->withHeaders($this->authHeaders($mgrToken))
                             ->get("api/projects/{$projectA['data']['id']}");
        $resultDetail->assertStatus(404);
    }

    // ════════════════════════════════════════════════════════════════
    // MAJOR: Validation error tests
    // ════════════════════════════════════════════════════════════════

    /** สร้างโครงการโดยไม่ส่ง code → 422 */
    public function testCreateProjectWithoutCodeReturns422(): void
    {
        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->withBodyFormat('json')
                       ->post('api/projects', [
                           'name'         => 'โครงการไม่มี code',
                           'project_type' => 'house',
                       ]);

        $result->assertStatus(422);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('code', $json['errors']);
    }

    /** สร้างโครงการโดยไม่ส่ง name → 422 */
    public function testCreateProjectWithoutNameReturns422(): void
    {
        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->withBodyFormat('json')
                       ->post('api/projects', [
                           'code'         => 'PJ-NONAME',
                           'project_type' => 'house',
                       ]);

        $result->assertStatus(422);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('name', $json['errors']);
    }

    /** สร้างโครงการด้วย project_type ไม่ถูกต้อง → 422 */
    public function testCreateProjectWithInvalidTypeReturns422(): void
    {
        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->withBodyFormat('json')
                       ->post('api/projects', [
                           'code'         => 'PJ-BADTYPE',
                           'name'         => 'โครงการ type ผิด',
                           'project_type' => 'apartment',
                       ]);

        $result->assertStatus(422);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('project_type', $json['errors']);
    }

    /** ส่ง pool_budget_amount ติดลบ → ต้อง clamp เป็น 0 */
    public function testCreateProjectWithNegativeBudgetClampedToZero(): void
    {
        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->withBodyFormat('json')
                       ->post('api/projects', [
                           'code'               => 'PJ-NEGBUDG',
                           'name'               => 'โครงการงบติดลบ',
                           'project_type'       => 'condo',
                           'pool_budget_amount'  => -500000,
                       ]);

        $result->assertStatus(201);
        $json = json_decode($result->getJSON(), true);

        // ตรวจใน DB ว่า pool_budget_amount ถูก clamp เป็น 0
        $db  = Database::connect();
        $row = $db->table('projects')->where('id', $json['data']['id'])->get()->getRowArray();
        $this->assertEquals(0, (float) $row['pool_budget_amount']);
    }

    // ════════════════════════════════════════════════════════════════
    // MAJOR: 404 tests
    // ════════════════════════════════════════════════════════════════

    /** GET project ที่ไม่มีอยู่ → 404 */
    public function testShowNonExistentProjectReturns404(): void
    {
        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->get('api/projects/99999');

        $result->assertStatus(404);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('error', $json);
    }

    /** PUT project ที่ไม่มีอยู่ → 404 */
    public function testUpdateNonExistentProjectReturns404(): void
    {
        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->withBodyFormat('json')
                       ->put('api/projects/99999', [
                           'name' => 'ไม่มี project นี้',
                       ]);

        $result->assertStatus(404);
    }

    /** DELETE project ที่ไม่มีอยู่ → 404 */
    public function testDeleteNonExistentProjectReturns404(): void
    {
        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->delete('api/projects/99999');

        $result->assertStatus(404);
    }

    // ════════════════════════════════════════════════════════════════
    // MAJOR: Delete edge cases
    // ════════════════════════════════════════════════════════════════

    /** ลบโครงการที่มี units → 400 */
    public function testDeleteProjectWithUnitsReturns400(): void
    {
        $created   = $this->createProject('PJ-UNIT', 'โครงการที่มี units');
        $projectId = $created['data']['id'];

        $db = Database::connect();
        $db->table('project_units')->insert([
            'project_id'      => $projectId,
            'unit_code'       => 'U-DEL-001',
            'unit_number'     => '001',
            'base_price'      => 3000000,
            'unit_cost'       => 2500000,
            'standard_budget' => 100000,
            'status'          => 'available',
            'created_at'      => date('Y-m-d H:i:s'),
            'updated_at'      => date('Y-m-d H:i:s'),
        ]);

        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->delete("api/projects/{$projectId}");

        $result->assertStatus(400);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('error', $json);
        $this->assertStringContainsString('ยูนิต', $json['error']);
    }

    /** ลบโครงการที่มี house_models → 400 */
    public function testDeleteProjectWithHouseModelsReturns400(): void
    {
        $created   = $this->createProject('PJ-HM', 'โครงการที่มีแบบบ้าน');
        $projectId = $created['data']['id'];

        $db = Database::connect();
        $db->table('house_models')->insert([
            'project_id'  => $projectId,
            'code'        => 'HM-001',
            'name'        => 'แบบบ้าน A',
            'description' => '',
            'created_at'  => date('Y-m-d H:i:s'),
            'updated_at'  => date('Y-m-d H:i:s'),
        ]);

        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->delete("api/projects/{$projectId}");

        $result->assertStatus(400);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('error', $json);
    }

    /** Soft-delete ตรวจใน DB ว่า status = inactive */
    public function testSoftDeleteSetsStatusInactive(): void
    {
        $created   = $this->createProject('PJ-SOFT', 'โครงการ soft-delete');
        $projectId = $created['data']['id'];

        // ก่อนลบ status ต้องเป็น active
        $db = Database::connect();
        $before = $db->table('projects')->where('id', $projectId)->get()->getRowArray();
        $this->assertEquals('active', $before['status']);

        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->delete("api/projects/{$projectId}");

        $result->assertStatus(200);

        // หลังลบ status ต้องเป็น inactive แต่ record ยังอยู่
        $after = $db->table('projects')->where('id', $projectId)->get()->getRowArray();
        $this->assertNotNull($after);
        $this->assertEquals('inactive', $after['status']);
    }

    // ════════════════════════════════════════════════════════════════
    // MAJOR: Sub-endpoint tests
    // ════════════════════════════════════════════════════════════════

    /** GET /api/projects/:id/units คืนข้อมูล units */
    public function testGetProjectUnitsReturnsData(): void
    {
        $created   = $this->createProject('PJ-UNITS', 'โครงการ units');
        $projectId = $created['data']['id'];

        // สร้าง unit ใน DB
        $db = Database::connect();
        $db->table('project_units')->insert([
            'project_id'      => $projectId,
            'unit_code'       => 'U-SUB-001',
            'unit_number'     => '101',
            'base_price'      => 5000000,
            'unit_cost'       => 4000000,
            'standard_budget' => 200000,
            'status'          => 'available',
            'created_at'      => date('Y-m-d H:i:s'),
            'updated_at'      => date('Y-m-d H:i:s'),
        ]);

        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->get("api/projects/{$projectId}/units");

        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('data', $json);
        $this->assertCount(1, $json['data']);
        $this->assertEquals('U-SUB-001', $json['data'][0]['unit_code']);
    }

    /** GET /api/projects/:id/house-models คืนข้อมูล house models */
    public function testGetProjectHouseModelsReturnsData(): void
    {
        $created   = $this->createProject('PJ-HMS', 'โครงการ house models');
        $projectId = $created['data']['id'];

        // สร้าง house model ใน DB
        $db = Database::connect();
        $db->table('house_models')->insert([
            'project_id'  => $projectId,
            'code'        => 'HM-SUB-001',
            'name'        => 'แบบบ้าน Premium',
            'description' => 'แบบบ้าน 2 ชั้น',
            'created_at'  => date('Y-m-d H:i:s'),
            'updated_at'  => date('Y-m-d H:i:s'),
        ]);

        $result = $this->withHeaders($this->authHeaders($this->token))
                       ->get("api/projects/{$projectId}/house-models");

        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('data', $json);
        $this->assertCount(1, $json['data']);
        $this->assertEquals('HM-SUB-001', $json['data'][0]['code']);
    }
}
