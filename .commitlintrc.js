/** @type {import('@commitlint/types').UserConfig} */
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat", // New feature
        "fix", // Bug fix
        "chore", // Maintenance (deps, config, scripts)
        "docs", // Documentation only
        "style", // Formatting, no logic change
        "refactor", // Code restructure, no feature/fix
        "perf", // Performance improvement
        "test", // Adding/fixing tests
        "build", // Build system changes
        "ci", // CI/CD changes
        "revert", // Revert a commit
        "wip", // Work in progress (never merge to main)
      ],
    ],
    "scope-enum": [
      1,
      "always",
      [
        "monorepo",
        "api",
        "web",
        "admin",
        "seller",
        "worker",
        "database",
        "types",
        "ui",
        "utils",
        "config",
        "docker",
        "ci",
        "auth",
        "catalog",
        "inventory",
        "orders",
        "payments",
        "notifications",
        "admin-module",
        "rfq",
        "returns",
      ],
    ],
    "subject-case": [2, "always", "lower-case"],
    "subject-max-length": [2, "always", 100],
    "body-max-line-length": [2, "always", 200],
  },
};
