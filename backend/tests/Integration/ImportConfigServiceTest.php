<?php

namespace Tests\Integration;

use Config\Database;

/**
 * ImportConfigServiceTest -- Integration tests สำหรับ /api/import-configs endpoints
 *
 * ทดสอบ:
 * - CRUD: create, read, list (filtered), update, delete (cascade columns)
 * - set-default: ยกเลิก default เดิม, แยกตาม import_type, แยกตาม project
 * - Validation: unique config_name ต่อ project, required fields
 * - Permission: admin/manager ได้, sales/finance/viewer ไม่ได้
 */
final class ImportConfigServiceTest extends BaseIntegrationTest
{
    private string $adminToken   = '';
    private int    $projectId    = 0;
    private int    $projectId2   = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->cleanDatabase();

        $this->adminToken = $this->setupAdminAndLogin('icadmin@promo.test');

        // สร้าง project สำหรับทดสอบ
        $result = $this->withHeaders($this->authHeaders($this->adminToken))
                       ->withBodyFormat('json')
                       ->post('api/projects', [
                           'code'         => 'PJ-IC-01',
                           'name'         => 'โครงการทดสอบ Import Config',
                           'project_type' => 'house',
                       ]);
        $json = json_decode($result->getJSON(), true);
        $this->projectId = (int) $json['data']['id'];

        // สร้าง project ที่ 2 สำหรับทดสอบ cross-project
        $result2 = $this->withHeaders($this->authHeaders($this->adminToken))
                        ->withBodyFormat('json')
                        ->post('api/projects', [
                            'code'         => 'PJ-IC-02',
                            'name'         => 'โครงการทดสอบ 2',
                            'project_type' => 'condo',
                        ]);
        $json2 = json_decode($result2->getJSON(), true);
        $this->projectId2 = (int) $json2['data']['id'];
    }

    // ── Helper: สร้าง config ผ่าน API ──────────────────────────────

    private function createConfig(
        string $name       = 'Config ทดสอบ',
        string $importType = 'bottom_line',
        ?int   $projectId  = null,
        bool   $isDefault  = false,
        array  $columns    = [],
    ): array {
        $result = $this->withHeaders($this->authHeaders($this->adminToken))
                       ->withBodyFormat('json')
                       ->post('api/import-configs', [
                           'project_id'     => $projectId ?? $this->projectId,
                           'config_name'    => $name,
                           'import_type'    => $importType,
                           'target_table'   => 'project_units',
                           'file_type'      => 'xlsx',
                           'header_row'     => 1,
                           'data_start_row' => 2,
                           'is_default'     => $isDefault,
                           'columns'        => $columns ?: $this->sampleColumns(),
                       ]);

        return json_decode($result->getJSON(), true);
    }

    private function sampleColumns(): array
    {
        return [
            [
                'source_column' => 'A',
                'target_field'  => 'unit_code',
                'field_label'   => 'รหัสยูนิต',
                'data_type'     => 'string',
                'is_required'   => true,
                'is_key_field'  => true,
                'sort_order'    => 0,
            ],
            [
                'source_column' => 'B',
                'target_field'  => 'unit_cost',
                'field_label'   => 'ราคาต้นทุน',
                'data_type'     => 'decimal',
                'is_required'   => true,
                'is_key_field'  => false,
                'sort_order'    => 1,
            ],
        ];
    }

    /**
     * Helper: สร้าง user ด้วย role ที่ระบุ แล้ว login ได้ token
     */
    private function createUserWithRole(string $role, string $email): string
    {
        // Admin สร้าง user
        $this->withHeaders($this->authHeaders($this->adminToken))
             ->withBodyFormat('json')
             ->post('api/users', [
                 'email'    => $email,
                 'password' => 'Test@1234',
                 'name'     => "User {$role}",
                 'role'     => $role,
             ]);

        // Assign project ให้ user
        $db   = Database::connect();
        $user = $db->table('users')->where('email', $email)->get()->getRowArray();
        if ($user) {
            $db->table('user_projects')->insert([
                'user_id'      => $user['id'],
                'project_id'   => $this->projectId,
                'access_level' => 'edit',
            ]);
        }

        // Login
        $loginResult = $this->withBodyFormat('json')->post('api/auth/login', [
            'email'    => $email,
            'password' => 'Test@1234',
        ]);
        $json = json_decode($loginResult->getJSON(), true);

        return $json['access_token'] ?? '';
    }

    // ═══════════════════════════════════════════════════════════════════
    // CRUD Tests
    // ═══════════════════════════════════════════════════════════════════

    public function testCreateConfigWithColumnsSucceeds(): void
    {
        $result = $this->withHeaders($this->authHeaders($this->adminToken))
                       ->withBodyFormat('json')
                       ->post('api/import-configs', [
                           'project_id'     => $this->projectId,
                           'config_name'    => 'Bottom Line Default',
                           'import_type'    => 'bottom_line',
                           'target_table'   => 'project_units',
                           'file_type'      => 'xlsx',
                           'header_row'     => 1,
                           'data_start_row' => 2,
                           'columns'        => $this->sampleColumns(),
                       ]);

        $result->assertStatus(201);
        $json = json_decode($result->getJSON(), true);

        $this->assertArrayHasKey('data', $json);
        $this->assertEquals('Bottom Line Default', $json['data']['config_name']);
        $this->assertEquals('bottom_line', $json['data']['import_type']);
        $this->assertCount(2, $json['data']['columns']);
        $this->assertEquals('unit_code', $json['data']['columns'][0]['target_field']);
        $this->assertEquals('unit_cost', $json['data']['columns'][1]['target_field']);
    }

    public function testGetConfigByIdReturnsColumns(): void
    {
        $created  = $this->createConfig('Config ดูรายละเอียด');
        $configId = (int) $created['data']['id'];

        $result = $this->withHeaders($this->authHeaders($this->adminToken))
                       ->get("api/import-configs/{$configId}");

        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);

        $this->assertArrayHasKey('data', $json);
        $this->assertEquals('Config ดูรายละเอียด', $json['data']['config_name']);
        $this->assertArrayHasKey('columns', $json['data']);
        $this->assertCount(2, $json['data']['columns']);
    }

    public function testListConfigsFilteredByProjectId(): void
    {
        $this->createConfig('Config PJ1-A', 'bottom_line', $this->projectId);
        $this->createConfig('Config PJ1-B', 'unit', $this->projectId);
        $this->createConfig('Config PJ2-A', 'bottom_line', $this->projectId2);

        $result = $this->withHeaders($this->authHeaders($this->adminToken))
                       ->get("api/import-configs?project_id={$this->projectId}");

        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);

        $this->assertCount(2, $json['data']);
    }

    public function testListConfigsFilteredByProjectIdAndImportType(): void
    {
        $this->createConfig('Config BL', 'bottom_line', $this->projectId);
        $this->createConfig('Config Unit', 'unit', $this->projectId);

        $result = $this->withHeaders($this->authHeaders($this->adminToken))
                       ->get("api/import-configs?project_id={$this->projectId}&import_type=bottom_line");

        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);

        $this->assertCount(1, $json['data']);
        $this->assertEquals('bottom_line', $json['data'][0]['import_type']);
    }

    public function testUpdateConfigReplacesColumns(): void
    {
        $created  = $this->createConfig('Config อัปเดต');
        $configId = (int) $created['data']['id'];

        $newColumns = [
            [
                'source_column' => 'C',
                'target_field'  => 'base_price',
                'field_label'   => 'ราคาขาย',
                'data_type'     => 'decimal',
                'is_required'   => true,
                'is_key_field'  => false,
                'sort_order'    => 0,
            ],
        ];

        $result = $this->withHeaders($this->authHeaders($this->adminToken))
                       ->withBodyFormat('json')
                       ->put("api/import-configs/{$configId}", [
                           'config_name'  => 'Config อัปเดตแล้ว',
                           'import_type'  => 'bottom_line',
                           'columns'      => $newColumns,
                       ]);

        $result->assertStatus(200);
        $json = json_decode($result->getJSON(), true);

        $this->assertEquals('Config อัปเดตแล้ว', $json['data']['config_name']);
        $this->assertCount(1, $json['data']['columns']);
        $this->assertEquals('base_price', $json['data']['columns'][0]['target_field']);
    }

    public function testDeleteConfigCascadesColumns(): void
    {
        $created  = $this->createConfig('Config ลบ');
        $configId = (int) $created['data']['id'];

        // ตรวจว่ามี columns ก่อนลบ
        $db = Database::connect();
        $columnsBefore = $db->table('import_config_columns')
            ->where('import_config_id', $configId)
            ->countAllResults();
        $this->assertGreaterThan(0, $columnsBefore);

        $result = $this->withHeaders($this->authHeaders($this->adminToken))
                       ->delete("api/import-configs/{$configId}");

        $result->assertStatus(200);

        // ตรวจว่า columns ถูกลบด้วย (cascade)
        $columnsAfter = $db->table('import_config_columns')
            ->where('import_config_id', $configId)
            ->countAllResults();
        $this->assertEquals(0, $columnsAfter);

        // ตรวจว่า config ถูกลบแล้ว
        $getResult = $this->withHeaders($this->authHeaders($this->adminToken))
                          ->get("api/import-configs/{$configId}");
        $getResult->assertStatus(404);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Set-Default Tests
    // ═══════════════════════════════════════════════════════════════════

    public function testSetDefaultUnsetsExistingDefault(): void
    {
        $config1 = $this->createConfig('Config Default 1', 'bottom_line', $this->projectId, true);
        $config2 = $this->createConfig('Config Default 2', 'bottom_line', $this->projectId);

        $id1 = (int) $config1['data']['id'];
        $id2 = (int) $config2['data']['id'];

        // ตรวจว่า config1 เป็น default
        $get1 = $this->withHeaders($this->authHeaders($this->adminToken))
                     ->get("api/import-configs/{$id1}");
        $json1 = json_decode($get1->getJSON(), true);
        $this->assertTrue($json1['data']['is_default']);

        // ตั้ง config2 เป็น default
        $result = $this->withHeaders($this->authHeaders($this->adminToken))
                       ->withBodyFormat('json')
                       ->put("api/import-configs/{$id2}/set-default");

        $result->assertStatus(200);

        // ตรวจว่า config1 ไม่ใช่ default แล้ว
        $get1After = $this->withHeaders($this->authHeaders($this->adminToken))
                         ->get("api/import-configs/{$id1}");
        $json1After = json_decode($get1After->getJSON(), true);
        $this->assertFalse($json1After['data']['is_default']);

        // ตรวจว่า config2 เป็น default
        $get2After = $this->withHeaders($this->authHeaders($this->adminToken))
                         ->get("api/import-configs/{$id2}");
        $json2After = json_decode($get2After->getJSON(), true);
        $this->assertTrue($json2After['data']['is_default']);
    }

    public function testSetDefaultDoesNotAffectDifferentImportTypes(): void
    {
        $configBL   = $this->createConfig('BL Default', 'bottom_line', $this->projectId, true);
        $configUnit = $this->createConfig('Unit Config', 'unit', $this->projectId);

        $idUnit = (int) $configUnit['data']['id'];

        // ตั้ง unit config เป็น default
        $this->withHeaders($this->authHeaders($this->adminToken))
             ->withBodyFormat('json')
             ->put("api/import-configs/{$idUnit}/set-default");

        // ตรวจว่า bottom_line config ยังเป็น default อยู่
        $idBL = (int) $configBL['data']['id'];
        $getBL = $this->withHeaders($this->authHeaders($this->adminToken))
                      ->get("api/import-configs/{$idBL}");
        $jsonBL = json_decode($getBL->getJSON(), true);
        $this->assertTrue($jsonBL['data']['is_default']);
    }

    public function testSetDefaultDoesNotAffectDifferentProjects(): void
    {
        $configPJ1 = $this->createConfig('PJ1 Default', 'bottom_line', $this->projectId, true);
        $configPJ2 = $this->createConfig('PJ2 Config', 'bottom_line', $this->projectId2);

        $idPJ2 = (int) $configPJ2['data']['id'];

        // ตั้ง PJ2 config เป็น default
        $this->withHeaders($this->authHeaders($this->adminToken))
             ->withBodyFormat('json')
             ->put("api/import-configs/{$idPJ2}/set-default");

        // ตรวจว่า PJ1 config ยังเป็น default อยู่
        $idPJ1 = (int) $configPJ1['data']['id'];
        $getPJ1 = $this->withHeaders($this->authHeaders($this->adminToken))
                       ->get("api/import-configs/{$idPJ1}");
        $jsonPJ1 = json_decode($getPJ1->getJSON(), true);
        $this->assertTrue($jsonPJ1['data']['is_default']);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Validation Tests
    // ═══════════════════════════════════════════════════════════════════

    public function testCannotCreateDuplicateConfigNameInSameProject(): void
    {
        $this->createConfig('Duplicate Name', 'bottom_line', $this->projectId);

        $result = $this->withHeaders($this->authHeaders($this->adminToken))
                       ->withBodyFormat('json')
                       ->post('api/import-configs', [
                           'project_id'   => $this->projectId,
                           'config_name'  => 'Duplicate Name',
                           'import_type'  => 'unit',
                           'target_table' => 'project_units',
                           'columns'      => $this->sampleColumns(),
                       ]);

        $result->assertStatus(422);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('error', $json);
    }

    public function testConfigNameCanBeDuplicatedAcrossProjects(): void
    {
        $this->createConfig('Same Name', 'bottom_line', $this->projectId);

        $result = $this->withHeaders($this->authHeaders($this->adminToken))
                       ->withBodyFormat('json')
                       ->post('api/import-configs', [
                           'project_id'   => $this->projectId2,
                           'config_name'  => 'Same Name',
                           'import_type'  => 'bottom_line',
                           'target_table' => 'project_units',
                           'columns'      => $this->sampleColumns(),
                       ]);

        $result->assertStatus(201);
        $json = json_decode($result->getJSON(), true);
        $this->assertEquals('Same Name', $json['data']['config_name']);
    }

    public function testRequiredFieldsValidated(): void
    {
        // ไม่ส่ง config_name
        $result1 = $this->withHeaders($this->authHeaders($this->adminToken))
                        ->withBodyFormat('json')
                        ->post('api/import-configs', [
                            'project_id'  => $this->projectId,
                            'import_type' => 'bottom_line',
                        ]);
        $result1->assertStatus(422);
        $json1 = json_decode($result1->getJSON(), true);
        $this->assertArrayHasKey('errors', $json1);
        $this->assertArrayHasKey('config_name', $json1['errors']);

        // ไม่ส่ง import_type
        $result2 = $this->withHeaders($this->authHeaders($this->adminToken))
                        ->withBodyFormat('json')
                        ->post('api/import-configs', [
                            'project_id'  => $this->projectId,
                            'config_name' => 'Valid Name',
                        ]);
        $result2->assertStatus(422);
        $json2 = json_decode($result2->getJSON(), true);
        $this->assertArrayHasKey('errors', $json2);
        $this->assertArrayHasKey('import_type', $json2['errors']);

        // ไม่ส่ง project_id
        $result3 = $this->withHeaders($this->authHeaders($this->adminToken))
                        ->withBodyFormat('json')
                        ->post('api/import-configs', [
                            'config_name' => 'No Project',
                            'import_type' => 'bottom_line',
                        ]);
        $result3->assertStatus(400);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Permission Tests
    // ═══════════════════════════════════════════════════════════════════

    public function testManagerCanCrudConfigs(): void
    {
        $managerToken = $this->createUserWithRole('manager', 'mgr@promo.test');

        // สร้าง config ด้วย manager
        $result = $this->withHeaders($this->authHeaders($managerToken))
                       ->withBodyFormat('json')
                       ->post('api/import-configs', [
                           'project_id'     => $this->projectId,
                           'config_name'    => 'Manager Config',
                           'import_type'    => 'bottom_line',
                           'target_table'   => 'project_units',
                           'file_type'      => 'xlsx',
                           'header_row'     => 1,
                           'data_start_row' => 2,
                           'columns'        => $this->sampleColumns(),
                       ]);

        $result->assertStatus(201);
        $json     = json_decode($result->getJSON(), true);
        $configId = (int) $json['data']['id'];

        // อ่าน
        $getResult = $this->withHeaders($this->authHeaders($managerToken))
                          ->get("api/import-configs/{$configId}");
        $getResult->assertStatus(200);

        // แก้ไข
        $putResult = $this->withHeaders($this->authHeaders($managerToken))
                         ->withBodyFormat('json')
                         ->put("api/import-configs/{$configId}", [
                             'config_name' => 'Manager Config Updated',
                             'import_type' => 'bottom_line',
                         ]);
        $putResult->assertStatus(200);

        // ลบ
        $delResult = $this->withHeaders($this->authHeaders($managerToken))
                          ->delete("api/import-configs/{$configId}");
        $delResult->assertStatus(200);
    }

    public function testSalesCannotCreateConfig(): void
    {
        $salesToken = $this->createUserWithRole('sales', 'sales@promo.test');

        $result = $this->withHeaders($this->authHeaders($salesToken))
                       ->withBodyFormat('json')
                       ->post('api/import-configs', [
                           'project_id'   => $this->projectId,
                           'config_name'  => 'Sales Config',
                           'import_type'  => 'bottom_line',
                           'target_table' => 'project_units',
                           'columns'      => $this->sampleColumns(),
                       ]);

        $result->assertStatus(403);
    }

    public function testFinanceCannotEditConfig(): void
    {
        $created  = $this->createConfig('Finance Test Config');
        $configId = (int) $created['data']['id'];

        $financeToken = $this->createUserWithRole('finance', 'fin@promo.test');

        $result = $this->withHeaders($this->authHeaders($financeToken))
                       ->withBodyFormat('json')
                       ->put("api/import-configs/{$configId}", [
                           'config_name' => 'Hacked Name',
                           'import_type' => 'bottom_line',
                       ]);

        $result->assertStatus(403);
    }

    public function testViewerCannotDeleteConfig(): void
    {
        $created  = $this->createConfig('Viewer Test Config');
        $configId = (int) $created['data']['id'];

        $viewerToken = $this->createUserWithRole('viewer', 'viewer@promo.test');

        $result = $this->withHeaders($this->authHeaders($viewerToken))
                       ->delete("api/import-configs/{$configId}");

        $result->assertStatus(403);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Edge case: GET non-existent config → 404
    // ═══════════════════════════════════════════════════════════════════

    public function testGetNonExistentConfigReturns404(): void
    {
        $result = $this->withHeaders($this->authHeaders($this->adminToken))
                       ->get('api/import-configs/99999');

        $result->assertStatus(404);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Auth Tests
    // ═══════════════════════════════════════════════════════════════════

    public function testUnauthenticatedCreateReturns401(): void
    {
        // ส่ง invalid token เพื่อทดสอบว่า JwtAuthFilter บล็อกได้
        $result = $this->withHeaders(['Authorization' => 'Bearer invalid.token.here'])
                       ->withBodyFormat('json')
                       ->post('api/import-configs', [
                           'project_id'     => $this->projectId,
                           'config_name'    => 'No Auth Config',
                           'import_type'    => 'bottom_line',
                           'target_table'   => 'project_units',
                           'file_type'      => 'xlsx',
                           'header_row'     => 1,
                           'data_start_row' => 2,
                           'columns'        => $this->sampleColumns(),
                       ]);

        $result->assertStatus(401);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Column Validation Tests
    // ═══════════════════════════════════════════════════════════════════

    public function testCreateWithInvalidColumnSourceReturns422(): void
    {
        // source_column "A1" มีตัวเลข → ไม่ผ่าน regex /^[A-Z]{1,3}$/
        $result = $this->withHeaders($this->authHeaders($this->adminToken))
                       ->withBodyFormat('json')
                       ->post('api/import-configs', [
                           'project_id'     => $this->projectId,
                           'config_name'    => 'Invalid Source Col',
                           'import_type'    => 'bottom_line',
                           'target_table'   => 'project_units',
                           'file_type'      => 'xlsx',
                           'header_row'     => 1,
                           'data_start_row' => 2,
                           'columns'        => [
                               [
                                   'source_column' => 'A1',
                                   'target_field'  => 'unit_code',
                                   'field_label'   => 'รหัสยูนิต',
                                   'data_type'     => 'string',
                                   'is_required'   => true,
                                   'is_key_field'  => true,
                                   'sort_order'    => 0,
                               ],
                           ],
                       ]);

        $result->assertStatus(422);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('errors', $json);
        $this->assertArrayHasKey('columns.0.source_column', $json['errors']);
    }

    public function testCreateWithMissingColumnTargetFieldReturns422(): void
    {
        $result = $this->withHeaders($this->authHeaders($this->adminToken))
                       ->withBodyFormat('json')
                       ->post('api/import-configs', [
                           'project_id'     => $this->projectId,
                           'config_name'    => 'Missing Target Field',
                           'import_type'    => 'bottom_line',
                           'target_table'   => 'project_units',
                           'file_type'      => 'xlsx',
                           'header_row'     => 1,
                           'data_start_row' => 2,
                           'columns'        => [
                               [
                                   'source_column' => 'A',
                                   'target_field'  => '',
                                   'field_label'   => 'รหัสยูนิต',
                                   'data_type'     => 'string',
                                   'is_required'   => true,
                                   'is_key_field'  => true,
                                   'sort_order'    => 0,
                               ],
                           ],
                       ]);

        $result->assertStatus(422);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('errors', $json);
        $this->assertArrayHasKey('columns.0.target_field', $json['errors']);
    }

    public function testCreateWithInvalidDataTypeReturns422(): void
    {
        $result = $this->withHeaders($this->authHeaders($this->adminToken))
                       ->withBodyFormat('json')
                       ->post('api/import-configs', [
                           'project_id'     => $this->projectId,
                           'config_name'    => 'Invalid Data Type',
                           'import_type'    => 'bottom_line',
                           'target_table'   => 'project_units',
                           'file_type'      => 'xlsx',
                           'header_row'     => 1,
                           'data_start_row' => 2,
                           'columns'        => [
                               [
                                   'source_column' => 'A',
                                   'target_field'  => 'unit_code',
                                   'field_label'   => 'รหัสยูนิต',
                                   'data_type'     => 'boolean',
                                   'is_required'   => true,
                                   'is_key_field'  => true,
                                   'sort_order'    => 0,
                               ],
                           ],
                       ]);

        $result->assertStatus(422);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('errors', $json);
        $this->assertArrayHasKey('columns.0.data_type', $json['errors']);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Empty Columns Array Test
    // ═══════════════════════════════════════════════════════════════════

    public function testCreateWithEmptyColumnsArraySucceeds(): void
    {
        $result = $this->withHeaders($this->authHeaders($this->adminToken))
                       ->withBodyFormat('json')
                       ->post('api/import-configs', [
                           'project_id'     => $this->projectId,
                           'config_name'    => 'Empty Columns Config',
                           'import_type'    => 'bottom_line',
                           'target_table'   => 'project_units',
                           'file_type'      => 'xlsx',
                           'header_row'     => 1,
                           'data_start_row' => 2,
                           'columns'        => [],
                       ]);

        $result->assertStatus(201);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('data', $json);
        $this->assertEquals('Empty Columns Config', $json['data']['config_name']);
    }

    // ═══════════════════════════════════════════════════════════════════
    // is_default on CREATE Test
    // ═══════════════════════════════════════════════════════════════════

    public function testCreateWithIsDefaultTrueClearsExistingDefault(): void
    {
        // สร้าง config1 พร้อม is_default=true
        $config1 = $this->createConfig('Default Config 1', 'bottom_line', $this->projectId, true);
        $id1     = (int) $config1['data']['id'];

        // ตรวจว่า config1 เป็น default
        $get1 = $this->withHeaders($this->authHeaders($this->adminToken))
                     ->get("api/import-configs/{$id1}");
        $json1 = json_decode($get1->getJSON(), true);
        $this->assertTrue($json1['data']['is_default']);

        // สร้าง config2 พร้อม is_default=true (เดียวกัน project + import_type)
        $config2 = $this->createConfig('Default Config 2', 'bottom_line', $this->projectId, true);
        $id2     = (int) $config2['data']['id'];

        // ตรวจว่า config2 เป็น default
        $get2 = $this->withHeaders($this->authHeaders($this->adminToken))
                     ->get("api/import-configs/{$id2}");
        $json2 = json_decode($get2->getJSON(), true);
        $this->assertTrue($json2['data']['is_default']);

        // ตรวจว่า config1 ไม่ใช่ default แล้ว
        $get1After = $this->withHeaders($this->authHeaders($this->adminToken))
                         ->get("api/import-configs/{$id1}");
        $json1After = json_decode($get1After->getJSON(), true);
        $this->assertFalse($json1After['data']['is_default']);
    }

    // ═══════════════════════════════════════════════════════════════════
    // Invalid import_type Test
    // ═══════════════════════════════════════════════════════════════════

    public function testCreateWithInvalidImportTypeReturns422(): void
    {
        $result = $this->withHeaders($this->authHeaders($this->adminToken))
                       ->withBodyFormat('json')
                       ->post('api/import-configs', [
                           'project_id'     => $this->projectId,
                           'config_name'    => 'Invalid Import Type',
                           'import_type'    => 'excel',
                           'target_table'   => 'project_units',
                           'file_type'      => 'xlsx',
                           'header_row'     => 1,
                           'data_start_row' => 2,
                           'columns'        => $this->sampleColumns(),
                       ]);

        $result->assertStatus(422);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('errors', $json);
        $this->assertArrayHasKey('import_type', $json['errors']);
    }

    // ═══════════════════════════════════════════════════════════════════
    // New Validation Rules Tests
    // ═══════════════════════════════════════════════════════════════════

    public function testCreateWithInvalidFileTypeReturns422(): void
    {
        $result = $this->withHeaders($this->authHeaders($this->adminToken))
                       ->withBodyFormat('json')
                       ->post('api/import-configs', [
                           'project_id'     => $this->projectId,
                           'config_name'    => 'Invalid File Type',
                           'import_type'    => 'bottom_line',
                           'target_table'   => 'project_units',
                           'file_type'      => 'pdf',
                           'header_row'     => 1,
                           'data_start_row' => 2,
                           'columns'        => $this->sampleColumns(),
                       ]);

        $result->assertStatus(422);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('errors', $json);
        $this->assertArrayHasKey('file_type', $json['errors']);
    }

    public function testCreateWithInvalidHeaderRowReturns422(): void
    {
        $result = $this->withHeaders($this->authHeaders($this->adminToken))
                       ->withBodyFormat('json')
                       ->post('api/import-configs', [
                           'project_id'     => $this->projectId,
                           'config_name'    => 'Invalid Header Row',
                           'import_type'    => 'bottom_line',
                           'target_table'   => 'project_units',
                           'file_type'      => 'xlsx',
                           'header_row'     => 0,
                           'data_start_row' => 2,
                           'columns'        => $this->sampleColumns(),
                       ]);

        $result->assertStatus(422);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('errors', $json);
        $this->assertArrayHasKey('header_row', $json['errors']);
    }

    public function testCreateWithDataStartRowLessThanHeaderRowReturns422(): void
    {
        $result = $this->withHeaders($this->authHeaders($this->adminToken))
                       ->withBodyFormat('json')
                       ->post('api/import-configs', [
                           'project_id'     => $this->projectId,
                           'config_name'    => 'Invalid Data Start Row',
                           'import_type'    => 'bottom_line',
                           'target_table'   => 'project_units',
                           'file_type'      => 'xlsx',
                           'header_row'     => 3,
                           'data_start_row' => 2,
                           'columns'        => $this->sampleColumns(),
                       ]);

        $result->assertStatus(422);
        $json = json_decode($result->getJSON(), true);
        $this->assertArrayHasKey('errors', $json);
        $this->assertArrayHasKey('data_start_row', $json['errors']);
    }
}
