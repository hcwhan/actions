
import { afterEach, describe, expect, it } from "vitest";

import { getGithubRefName } from "@/base/github-context.js";


describe("getGithubRefName", () => {
  const orig = process.env.GITHUB_REF_NAME;

  afterEach(() => {
    if (orig === undefined) delete process.env.GITHUB_REF_NAME;
    else process.env.GITHUB_REF_NAME = orig;
  });

  it("返回 GITHUB_REF_NAME", () => {
    process.env.GITHUB_REF_NAME = "main";
    expect(getGithubRefName()).toBe("main");
  });

  it("缺失时 throw", () => {
    delete process.env.GITHUB_REF_NAME;
    expect(() => getGithubRefName()).toThrow(/GITHUB_REF_NAME/);
  });
});
