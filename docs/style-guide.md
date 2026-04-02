# PromoControl API Documentation Style Guide

## Terminology
- Use "Request Body" not "payload", "body", "data"
- Use "endpoint" not "route" or "path"
- Use "parameter" not "param" or "arg"
- HTTP methods always UPPERCASE: GET, POST, PUT, DELETE
- Use Thai for descriptions and notes in docs
- Use English for API paths, JSON keys, code examples

## Template Sections (in order)
1. H1: HTTP method + path
2. ## Description (Thai)
3. ## Authentication (role requirements)
4. ## Request (Headers, Body/Query params)
5. ### Example Request (curl)
6. ## Response (Success JSON)
7. ### Error Responses (table)
8. ## Notes (Thai, optional)

## Example Values (consistent across all PromoControl docs)
- email: "admin@promocontrol.local"
- user ID: 1 (integer, MySQL auto-increment)
- project code: "PJ001"
- project name: "โครงการทดสอบ"
- unit code: "A-101"
- base_price: 3500000.00 (DECIMAL, Thai Baht)
- budget amount: 100000.00
- timestamps: ISO 8601 "2026-03-23T10:00:00+07:00" (Bangkok timezone)

## Curl Examples
- Always use `-H "Content-Type: application/json"`
- Always use `-H "Authorization: Bearer <token>"` for auth endpoints
- Use `localhost:8080/api` as base URL (via nginx proxy)
- Pretty-print JSON with `| jq .` at the end

## Error Response Table Format
| Status | Description |
|--------|-------------|
| 400    | Validation error — ข้อมูลไม่ถูกต้อง |
| 401    | Authentication required — ไม่ได้ login หรือ token หมดอายุ |
| 403    | Forbidden — ไม่มีสิทธิ์เข้าถึง (role/access_level) |
| 404    | ไม่พบข้อมูล |
| 409    | Conflict — ข้อมูลซ้ำหรือสถานะไม่อนุญาต |
| 422    | Unprocessable — business rule violation |
| 500    | Internal server error |
