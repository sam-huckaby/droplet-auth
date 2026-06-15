import { describe, expect, it } from "vitest";
import { parseAuditPagination } from "../src/routes/admin";

describe("admin audit pagination", () => {
  it("defaults to the first 50-event page", () => {
    expect(parseAuditPagination(new URLSearchParams())).toEqual({ page: 1, pageSize: 50, offset: 0 });
  });

  it("accepts supported page sizes", () => {
    expect(parseAuditPagination(new URLSearchParams("auditPage=3&auditPageSize=100"))).toEqual({ page: 3, pageSize: 100, offset: 200 });
    expect(parseAuditPagination(new URLSearchParams("auditPage=2&auditPageSize=500"))).toEqual({ page: 2, pageSize: 500, offset: 500 });
  });

  it("rejects unsupported page sizes", () => {
    expect(parseAuditPagination(new URLSearchParams("auditPage=2&auditPageSize=25"))).toEqual({ page: 2, pageSize: 50, offset: 50 });
  });

  it("clamps invalid pages to page one", () => {
    expect(parseAuditPagination(new URLSearchParams("auditPage=0&auditPageSize=100"))).toEqual({ page: 1, pageSize: 100, offset: 0 });
    expect(parseAuditPagination(new URLSearchParams("auditPage=abc&auditPageSize=100"))).toEqual({ page: 1, pageSize: 100, offset: 0 });
  });
});
