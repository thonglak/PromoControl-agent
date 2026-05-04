<?php

use CodeIgniter\Router\RouteCollection;

/**
 * @var RouteCollection $routes
 */

// Public routes
$routes->get('api/auth/check-setup', 'AuthController::checkSetup');
$routes->post('api/auth/setup',      'AuthController::setup');
$routes->post('api/auth/login',      'AuthController::login');
$routes->post('api/auth/refresh',    'AuthController::refresh');

// Narai Connect SSO routes (public — ไม่ต้องตรวจ JWT)
$routes->get('api/auth/sso/authorize', 'SsoController::authorize');
$routes->get('api/auth/sso/callback',  'SsoController::callback');

// Authenticated routes
$routes->group('api', static function (RouteCollection $routes): void {

    $routes->get('auth/me',              'AuthController::me');
    $routes->post('auth/logout',         'AuthController::logout');
    $routes->put('auth/change-password', 'AuthController::changePassword');

    $routes->group('users', ['filter' => 'role:admin'], static function (RouteCollection $routes): void {
        $routes->get('/',                      'UserController::index');
        $routes->post('/',                     'UserController::create');
        $routes->get('browse-source',          'UserController::browseSource');
        $routes->post('bulk-import',           'UserController::bulkImport');
        $routes->get('(:num)',                 'UserController::show/$1');
        $routes->put('(:num)',                 'UserController::update/$1');
        $routes->delete('(:num)',              'UserController::delete/$1');
        $routes->put('(:num)/projects',        'UserController::assignProjects/$1');
        $routes->put('(:num)/reset-password',  'UserController::resetPassword/$1');
    });

    $routes->group('projects', static function (RouteCollection $routes): void {
        $routes->get('/',                        'ProjectController::index');
        $routes->get('(:num)',                   'ProjectController::show/$1');
        $routes->get('(:num)/units',             'ProjectController::units/$1');
        $routes->get('(:num)/house-models',      'ProjectController::houseModels/$1');
    });
    $routes->group('projects', ['filter' => 'role:admin,manager'], static function (RouteCollection $routes): void {
        $routes->post('/',          'ProjectController::create');
        $routes->put('(:num)',      'ProjectController::update/$1');
    });
    $routes->group('projects', ['filter' => 'role:admin'], static function (RouteCollection $routes): void {
        $routes->delete('(:num)',   'ProjectController::delete/$1');
    });

    $routes->group('house-models', static function (RouteCollection $routes): void {
        $routes->get('/',        'HouseModelController::index');
        $routes->get('(:num)',   'HouseModelController::show/$1');
    });
    $routes->group('house-models', ['filter' => 'role:admin,manager'], static function (RouteCollection $routes): void {
        $routes->post('/',          'HouseModelController::create');
        $routes->put('(:num)',      'HouseModelController::update/$1');
        $routes->delete('(:num)',   'HouseModelController::delete/$1');
    });

    $routes->group('units', static function (RouteCollection $routes): void {
        $routes->get('/',        'UnitController::index');
        $routes->get('export',   'UnitController::exportExcel');
        $routes->get('(:num)',   'UnitController::show/$1');
    });
    $routes->group('units', ['filter' => 'role:admin,manager'], static function (RouteCollection $routes): void {
        $routes->post('/',          'UnitController::create');
        $routes->put('(:num)',      'UnitController::update/$1');
        $routes->delete('(:num)',   'UnitController::delete/$1');
        $routes->post('bulk',       'UnitController::bulkCreate');
    });



    // Fee Formulas (สูตรคำนวณ)
    $routes->group('fee-formulas', static function (RouteCollection $routes): void {
        $routes->get('/',        'FeeFormulaController::index');
        $routes->get('(:num)',   'FeeFormulaController::show/$1');
    });
    $routes->group('fee-formulas', ['filter' => 'role:admin,manager'], static function (RouteCollection $routes): void {
        $routes->post('/',         'FeeFormulaController::create');
        $routes->put('(:num)',     'FeeFormulaController::update/$1');
        $routes->delete('(:num)',  'FeeFormulaController::delete/$1');
        $routes->post('test',      'FeeFormulaController::test');
        $routes->post('test-batch', 'FeeFormulaController::testBatch');
        $routes->post('calculate-for-entry', 'FeeFormulaController::calculateForEntry');
    });

    // Fee Rate Policies (มาตรการ/นโยบาย)
    $routes->group('fee-rate-policies', static function (RouteCollection $routes): void {
        $routes->get('/',        'FeeRatePolicyController::index');
    });
    $routes->group('fee-rate-policies', ['filter' => 'role:admin,manager'], static function (RouteCollection $routes): void {
        $routes->post('/',                  'FeeRatePolicyController::create');
        $routes->put('(:num)',              'FeeRatePolicyController::update/$1');
        $routes->delete('(:num)',           'FeeRatePolicyController::delete/$1');
        $routes->patch('(:num)/toggle',     'FeeRatePolicyController::toggle/$1');
    });

    // Unit Types (ประเภทยูนิต — เฉพาะ mixed project)
    $routes->group('unit-types', static function (RouteCollection $routes): void {
        $routes->get('/',        'UnitTypeController::index');
    });
    $routes->group('unit-types', ['filter' => 'role:admin,manager'], static function (RouteCollection $routes): void {
        $routes->post('/',         'UnitTypeController::create');
        $routes->put('(:num)',     'UnitTypeController::update/$1');
        $routes->delete('(:num)',  'UnitTypeController::delete/$1');
    });
    // Phases (เฟสโครงการ)
    $routes->group('phases', static function (RouteCollection $routes): void {
        $routes->get('/',        'PhaseController::index');
    });
    $routes->group('phases', ['filter' => 'role:admin,manager'], static function (RouteCollection $routes): void {
        $routes->post('/',         'PhaseController::create');
        $routes->put('(:num)',     'PhaseController::update/$1');
        $routes->delete('(:num)',  'PhaseController::delete/$1');
    });

    // Promotion Items (รายการโปรโมชั่น)
    $routes->group('promotion-items', static function (RouteCollection $routes): void {
        $routes->get('/',          'PromotionItemController::index');
        $routes->get('eligible',   'PromotionItemController::eligible');
        $routes->get('(:num)',     'PromotionItemController::show/$1');
    });
    $routes->group('promotion-items', ['filter' => 'role:admin,manager'], static function (RouteCollection $routes): void {
        $routes->post('/',                'PromotionItemController::create');
        $routes->get('browse-source',     'PromotionItemController::browseSource');
        $routes->get('source-projects',   'PromotionItemController::sourceProjects');
        $routes->post('bulk-import',      'PromotionItemController::bulkImport');
        $routes->put('(:num)',            'PromotionItemController::update/$1');
        $routes->delete('(:num)',         'PromotionItemController::delete/$1');
    });

    // Budget Movements (งบประมาณ)
    $routes->group('budget-movements', static function (RouteCollection $routes): void {
        $routes->get('/',                    'BudgetMovementController::index');
        $routes->get('summary/(:num)',       'BudgetMovementController::unitSummary/$1');
        $routes->get('pool-balance',          'BudgetMovementController::poolBalance');
        $routes->get('units-with-remaining',    'BudgetMovementController::getUnitsWithRemaining');
        $routes->get('return-history',           'BudgetMovementController::getReturnHistory');
    });
    $routes->group('budget-movements', ['filter' => 'role:admin,manager'], static function (RouteCollection $routes): void {
        $routes->post('/',                    'BudgetMovementController::create');
        $routes->post('transfer',             'BudgetMovementController::transfer');
        $routes->post('(:num)/approve',       'BudgetMovementController::approve/$1');
        $routes->post('(:num)/reject',        'BudgetMovementController::reject/$1');
        $routes->post('return-special',        'BudgetMovementController::returnSpecialBudget');
        $routes->post('return-to-pool',         'BudgetMovementController::returnUnitBudgetToPool');
        $routes->post('transfer-special',      'BudgetMovementController::transferSpecialBudget');
        $routes->post('void-special',          'BudgetMovementController::voidSpecialBudget');
        $routes->post('batch-return-to-pool',   'BudgetMovementController::batchReturnUnitBudgetToPool');
    });

    // Unit Budget Allocations (ตั้งงบผูกยูนิต)
    $routes->group('unit-budget-allocations', static function (RouteCollection $routes): void {
        $routes->get('(:num)',               'UnitBudgetAllocationController::show/$1');
    });
    $routes->group('unit-budget-allocations', ['filter' => 'role:admin,manager,sales'], static function (RouteCollection $routes): void {
        $routes->post('/',                    'UnitBudgetAllocationController::create');
    });
    $routes->group('unit-budget-allocations', ['filter' => 'role:admin,manager'], static function (RouteCollection $routes): void {
        $routes->put('(:num)',                'UnitBudgetAllocationController::update/$1');
        $routes->delete('(:num)',             'UnitBudgetAllocationController::delete/$1');
    });

    // Sales Transactions (รายการขาย)
    $routes->group('sales-transactions', static function (RouteCollection $routes): void {
        $routes->get('/',        'SalesTransactionController::index');
        $routes->get('(:num)',   'SalesTransactionController::show/$1');
    });
    $routes->group('sales-transactions', ['filter' => 'role:admin,manager,sales'], static function (RouteCollection $routes): void {
        $routes->post('/',                  'SalesTransactionController::create');
        $routes->post('(:num)/cancel',      'SalesTransactionController::cancelSale/$1');
        $routes->post('(:num)/transfer',    'SalesTransactionController::transfer/$1');
    });
    $routes->group('sales-transactions', ['filter' => 'role:admin,manager'], static function (RouteCollection $routes): void {
        $routes->put('(:num)',    'SalesTransactionController::update/$1');
    });

    // Bottom Line (ราคาต้นทุน)
    $routes->group('bottom-lines', static function (RouteCollection $routes): void {
        $routes->get('/',        'BottomLineController::history');
        $routes->get('sample',     'BottomLineController::downloadSample');
        $routes->get('(:segment)', 'BottomLineController::show/$1');
    });
    $routes->group('bottom-lines', ['filter' => 'role:admin,manager'], static function (RouteCollection $routes): void {
        $routes->post('upload',    'BottomLineController::upload');
        $routes->post('preview',   'BottomLineController::preview');
        $routes->post('import',    'BottomLineController::import');
    });
    $routes->group('bottom-lines', ['filter' => 'role:admin'], static function (RouteCollection $routes): void {
        $routes->post('(:segment)/rollback', 'BottomLineController::rollback/$1');
    });

    $routes->group('bottom-line-mappings', ['filter' => 'role:admin,manager'], static function (RouteCollection $routes): void {
        $routes->get('/',          'BottomLineMappingController::index');
        $routes->get('(:num)',     'BottomLineMappingController::show/$1');
        $routes->post('/',         'BottomLineMappingController::create');
        $routes->put('(:num)',     'BottomLineMappingController::update/$1');
        $routes->delete('(:num)',  'BottomLineMappingController::delete/$1');
    });
    
    // Number Series (เลขที่เอกสาร)
    $routes->group('number-series', static function (RouteCollection $routes): void {
        $routes->get('/',              'NumberSeriesController::index');
        $routes->get('(:num)',         'NumberSeriesController::show/$1');
        $routes->get('(:num)/logs',    'NumberSeriesController::logs/$1');
    });
    $routes->group('number-series', ['filter' => 'role:admin,manager'], static function (RouteCollection $routes): void {
        $routes->put('(:num)',         'NumberSeriesController::update/$1');
        $routes->post('preview',       'NumberSeriesController::preview');
    });

    // Reports (รายงาน)
    $routes->group('reports', ['filter' => 'role:admin,manager,finance,viewer'], static function (RouteCollection $routes): void {
        $routes->get('sales',            'ReportController::sales');
        $routes->get('budget',           'ReportController::budget');
        $routes->get('promotion-usage',  'ReportController::promotionUsage');
        $routes->get('sales/export',     'ReportController::exportSales');
        $routes->get('budget/export',    'ReportController::exportBudget');
    });

    // Sync Target Tables (ตั้งค่า target table สำหรับ sync — admin only)
    $routes->group('sync-target-tables', ['filter' => 'role:admin'], static function (RouteCollection $routes): void {
        $routes->get('/',              'SyncTargetTableController::index');
        $routes->post('/',             'SyncTargetTableController::store');
        $routes->put('(:num)',         'SyncTargetTableController::update/$1');
        $routes->delete('(:num)',      'SyncTargetTableController::delete/$1');
        $routes->get('(:num)/columns', 'SyncTargetTableController::columns/$1');
    });

    // External API Configs (ตั้งค่า API ภายนอก — admin, manager)
    $routes->group('external-api-configs', ['filter' => 'role:admin,manager'], static function (RouteCollection $routes): void {
        $routes->get('/',          'ExternalApiConfigController::index');
        $routes->post('/',         'ExternalApiConfigController::create');
        $routes->put('(:num)',     'ExternalApiConfigController::update/$1');
        $routes->delete('(:num)',  'ExternalApiConfigController::delete/$1');
    });

    // Sync from API (ดึงยูนิตจาก API ภายนอก — admin, manager)
    $routes->group('sync-from-api', ['filter' => 'role:admin,manager'], static function (RouteCollection $routes): void {
        $routes->get('/',          'SyncFromApiController::index');
        $routes->post('fetch',     'SyncFromApiController::fetch');
        $routes->post('test',      'SyncFromApiController::test');
        $routes->get('(:num)',     'SyncFromApiController::show/$1');
        $routes->post('(:num)/sync', 'SyncFromApiController::sync/$1');
        $routes->post('(:num)/sync-house-models', 'SyncFromApiController::syncHouseModels/$1');
        $routes->put('(:num)',     'SyncFromApiController::update/$1');
        $routes->delete('(:num)',  'SyncFromApiController::delete/$1');
    });

    // API Field Mappings (จับคู่ field)
    $routes->group('api-field-mappings', ['filter' => 'role:admin,manager'], static function (RouteCollection $routes): void {
        $routes->get('/',             'ApiFieldMappingController::index');
        $routes->get('target-fields', 'ApiFieldMappingController::targetFields');
        $routes->get('source-fields', 'ApiFieldMappingController::sourceFields');
        $routes->get('(:num)',        'ApiFieldMappingController::show/$1');
        $routes->get('(:num)/export', 'ApiFieldMappingController::export/$1');
        $routes->post('/',            'ApiFieldMappingController::create');
        $routes->post('import',       'ApiFieldMappingController::import');
        $routes->put('(:num)',        'ApiFieldMappingController::update/$1');
        $routes->delete('(:num)',     'ApiFieldMappingController::delete/$1');
    });

    // Dev Tools (สำหรับทดสอบ — admin only)
    $routes->group('dev', ['filter' => 'role:admin'], static function (RouteCollection $routes): void {
        $routes->post('clear-transactions', 'DevToolController::clearTransactions');
    });

    // Dashboard (Sales-Focused)
    $routes->get('dashboard', 'DashboardController::summary');
    $routes->post('dashboard/calculate-discount', 'DashboardController::calculateDiscount');

    // (phases route อยู่ใน PhaseController group ด้านบน)


});
