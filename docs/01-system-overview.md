# Promotion & Budget Management System

## Overview
This system manages promotions, discounts, free gifts, and promotion budgets
for a real estate sales platform.

It allows companies to:
- authenticate users with JWT and role-based access control
- manage projects, house models, and units
- import bottom line costs and appraisal prices from Excel
- manage promotion items
- allocate promotion budgets
- track promotion usage
- manage budget pools
- use special management budgets
- record promotion usage in sales transactions
- calculate real profit

## Core Concepts
The system revolves around:
- Authentication & Authorization (JWT + RBAC)
- Users and Roles (admin, manager, sales, finance, viewer)
- Projects (โครงการ)
- House Models (แบบบ้าน)
- Units (condos/houses)
- Promotion Items
- Promotion Budgets
- Budget Pools
- Bottom Line Import (ราคาต้นทุน + ราคาประเมิน)
- Budget Movement Ledger
- Sales Transactions

## Technology Stack
Backend: CodeIgniter 4 + firebase/php-jwt
Frontend: Angular 21 + Angular Material 21 + Tailwind CSS 3
Database: MySQL
Infrastructure: Docker

---

## System Architecture

Backend:
- CodeIgniter 4
- JWT Authentication (firebase/php-jwt)

Frontend:
- Angular 21 + Angular Material 21 + Tailwind CSS 3

Core Services:
- AuthService (JWT login, refresh, logout, password management, initial setup)
- ProjectService (project selection, access level management)
- PromotionCalculationService
- BudgetMovementService
- BottomLineImportService (Excel import, backup, column mapping)

Middleware:
- JwtAuthFilter (token validation on all /api/* routes)
- RoleFilter (role-based route access)
- AccessLevelFilter (project-level view/edit access control)

Modules:
- Authentication Module (JWT, RBAC, user management)
- Master Data Module (projects, house models, units)
- Bottom Line Module (Excel import, mapping presets, backup/rollback)
- Promotion Module
- Budget Module
- Approval Module
- Reporting Module

---

## Implementation Phases

Phase 1: Confirm business logic
Phase 2: System architecture
Phase 3: Database schema (including users, projects, house_models, project_units)
Phase 4: SQL migrations
Phase 5: Authentication — JWT login, refresh, logout, middleware, guards, initial admin setup
Phase 6: User Management — CRUD, role assignment, project assignment with access levels (view/edit)
Phase 7: Master Data CRUD — Projects, House Models, Units
Phase 8: Promotion calculation engine
Phase 9: Budget ledger engine
Phase 10: Backend CRUD APIs (all entities with auth + role protection)
Phase 11: Angular UI — Login page (+ initial admin setup), Project Selection page, auth interceptor, guards (auth/project/role/access-level)
Phase 12: Angular UI — User Management (admin)
Phase 13: Angular UI — Master Data screens (Projects, House Models, Units)
Phase 14: Bottom Line Import — Excel upload, mapping, backup, dynamic table, rollback
Phase 15: Angular UI — Bottom Line screens (import stepper, history, mapping presets)
Phase 16: Angular UI — Promotion & Budget screens
Phase 17: Angular UI — Sales Entry
Phase 18: Test scenarios (including auth + permission + bottom line import tests)
