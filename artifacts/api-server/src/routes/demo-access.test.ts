import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo, Server } from "node:net";
import type { RequestHandler } from "express";
import { createApp } from "../app";
import type { EnterpriseContext } from "../middleware/auth";

const context: EnterpriseContext = {
  userId: "team-user",
  organizationId: "team-organization",
  storeId: "team-store",
  role: "employee",
  membershipStatus: "active",
};

const authenticated: RequestHandler = (req, _res, next) => {
  req.enterprise = context;
  next();
};

const unauthenticated: RequestHandler = (_req, res) => {
  res.status(401).json({ message: "Authentication is required." });
};

const json = (code: string): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ code }),
});

const startServer = async (auth: RequestHandler) => {
  const server = createApp(auth).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    server,
    request: (init?: RequestInit) => fetch(`http://127.0.0.1:${port}/api/demo/access`, init),
  };
};

test("demo access requires Clerk authentication and an active membership", async () => {
  const { server, request } = await startServer(unauthenticated);
  try {
    const response = await request(json("anything"));
    assert.equal(response.status, 401);
  } finally {
    server.close();
  }
});

test("demo eligibility is only returned for an active team membership", async () => {
  const active = await startServer(authenticated);
  try {
    const response = await fetch(new URL("/api/demo/eligibility", "http://127.0.0.1:" + (active.server.address() as AddressInfo).port));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { eligible: true });
  } finally {
    active.server.close();
  }

  const inactiveAuth: RequestHandler = (req, _res, next) => {
    req.enterprise = { ...context, membershipStatus: "invited" };
    next();
  };
  const inactive = await startServer(inactiveAuth);
  try {
    const response = await fetch(new URL("/api/demo/eligibility", "http://127.0.0.1:" + (inactive.server.address() as AddressInfo).port));
    assert.equal(response.status, 403);
  } finally {
    inactive.server.close();
  }
});

test("demo access verifies the private code without exposing it", async () => {
  const previousCode = process.env.DEMO_ACCESS_CODE;
  process.env.DEMO_ACCESS_CODE = "unit-test-demo-code";
  const { server, request } = await startServer(authenticated);
  try {
    const wrong = await request(json("wrong-code"));
    assert.equal(wrong.status, 403);
    assert.deepEqual(await wrong.json(), {
      code: "DEMO_ACCESS_DENIED",
      message: "That demo access code is not valid.",
    });

    const correct = await request(json("unit-test-demo-code"));
    assert.equal(correct.status, 200);
    assert.deepEqual(await correct.json(), { allowed: true });
  } finally {
    server.close();
    if (previousCode === undefined) delete process.env.DEMO_ACCESS_CODE;
    else process.env.DEMO_ACCESS_CODE = previousCode;
  }
});