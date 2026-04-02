<?php

namespace Config;

use App\Filters\AccessLevelFilter;
use App\Filters\CorsFilter;
use App\Filters\JwtAuthFilter;
use App\Filters\RoleFilter;
use CodeIgniter\Config\Filters as BaseFilters;
use CodeIgniter\Filters\Cors;
use CodeIgniter\Filters\CSRF;
use CodeIgniter\Filters\DebugToolbar;
use CodeIgniter\Filters\ForceHTTPS;
use CodeIgniter\Filters\Honeypot;
use CodeIgniter\Filters\InvalidChars;
use CodeIgniter\Filters\PageCache;
use CodeIgniter\Filters\PerformanceMetrics;
use CodeIgniter\Filters\SecureHeaders;

class Filters extends BaseFilters
{
    /**
     * alias สำหรับ filter class ทั้งหมด
     *
     * @var array<string, class-string|list<class-string>>
     */
    public array $aliases = [
        'csrf'          => CSRF::class,
        'toolbar'       => DebugToolbar::class,
        'honeypot'      => Honeypot::class,
        'invalidchars'  => InvalidChars::class,
        'secureheaders' => SecureHeaders::class,
        'cors'          => Cors::class,
        'forcehttps'    => ForceHTTPS::class,
        'pagecache'     => PageCache::class,
        'performance'   => PerformanceMetrics::class,
        // filter CORS ของ project — ใช้กับทุก request
        'appcors'       => CorsFilter::class,
        // JWT Authentication filter — ใช้กับ /api/* (ยกเว้น public auth routes)
        'jwt_auth'      => JwtAuthFilter::class,
        // Role-based access control — ใช้กับ route ที่ต้องการจำกัด role
        'role'          => RoleFilter::class,
        // Project-level access control — ใช้กับ route ที่ต้องการตรวจ access_level
        'access'        => AccessLevelFilter::class,
    ];

    /**
     * filter พิเศษที่ทำงานทุก request (ก่อนและหลัง routing)
     *
     * @var array{before: list<string>, after: list<string>}
     */
    public array $required = [
        'before' => [
            'forcehttps', // บังคับ HTTPS ใน production
            'pagecache',  // Web Page Caching
        ],
        'after' => [
            'pagecache',   // Web Page Caching
            'performance', // Performance Metrics
            'toolbar',     // Debug Toolbar
        ],
    ];

    /**
     * filter ที่ทำงานกับทุก request โดย default
     *
     * @var array{
     *     before: array<string, array{except: list<string>|string}>|list<string>,
     *     after: array<string, array{except: list<string>|string}>|list<string>
     * }
     */
    public array $globals = [
        'before' => [
            // ใส่ CORS header ก่อน request ทุกตัวเพื่อรองรับ OPTIONS preflight
            'appcors',
        ],
        'after' => [
            // ใส่ CORS header หลัง response ด้วย
            'appcors',
        ],
    ];

    /**
     * filter ตาม HTTP method
     *
     * @var array<string, list<string>>
     */
    public array $methods = [];

    /**
     * filter ตาม URI pattern
     *
     * jwt_auth ใช้กับทุก /api/* route
     * Routes ที่ยกเว้นถูก handle ภายใน JwtAuthFilter::before()
     * ได้แก่: api/auth/check-setup, api/auth/setup, api/auth/login, api/auth/refresh
     *
     * @var array<string, array<string, list<string>>>
     */
    public array $filters = [
        'jwt_auth' => [
            'before' => ['api/*'],
        ],
    ];
}
