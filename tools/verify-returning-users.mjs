#!/usr/bin/env node

function generateReturningSeries(timeline, interval = "weekly") {
  const normalizedInterval = interval === "monthly" ? "monthly" : "weekly";
  if (!Array.isArray(timeline) || !timeline.length) {
    return { labels: [], totals: [], returningCounts: [] };
  }

  if (normalizedInterval === "monthly") {
    const monthMap = new Map();
    timeline.forEach(entry => {
      if (!entry || !(entry.date instanceof Date) || !(entry.users instanceof Set)) {
        return;
      }
      const monthKey = `${entry.date.getUTCFullYear()}-${String(entry.date.getUTCMonth() + 1).padStart(2, "0")}`;
      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, { key: monthKey, users: new Set() });
      }
      const bucket = monthMap.get(monthKey);
      entry.users.forEach(user => bucket.users.add(user));
    });
    const months = Array.from(monthMap.values()).sort((a, b) => a.key.localeCompare(b.key));
    const totals = months.map(month => month.users.size);
    const returningCounts = months.map((month, index) => {
      if (index === 0) {
        return 0;
      }
      let returning = 0;
      month.users.forEach(user => {
        if (months[index - 1].users.has(user)) {
          returning += 1;
        }
      });
      return returning;
    });
    return {
      labels: months.map(month => month.key),
      totals,
      returningCounts
    };
  }

  const weeks = timeline
    .filter(entry => entry && entry.label && entry.users instanceof Set)
    .map(entry => ({ label: entry.label, users: entry.users }));
  const totals = weeks.map(week => week.users.size);
  const returningCounts = weeks.map((week, index) => {
    if (index === 0) {
      return 0;
    }
    let returning = 0;
    week.users.forEach(user => {
      if (weeks[index - 1].users.has(user)) {
        returning += 1;
      }
    });
    return returning;
  });
  return {
    labels: weeks.map(week => week.label),
    totals,
    returningCounts
  };
}

function formatPercent(returning, total) {
  if (!total) {
    return "0.0%";
  }
  return `${((returning / total) * 100).toFixed(1)}%`;
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function runWeeklyCase() {
  const timeline = [
    { label: "2025-W01", date: new Date(Date.UTC(2025, 0, 5)), users: new Set(["U1", "U2"]) },
    { label: "2025-W02", date: new Date(Date.UTC(2025, 0, 12)), users: new Set(["U1", "U3"]) },
    { label: "2025-W03", date: new Date(Date.UTC(2025, 0, 19)), users: new Set(["U1", "U4"]) }
  ];
  const series = generateReturningSeries(timeline, "weekly");
  const lastIndex = series.labels.length - 1;
  const returning = series.returningCounts[lastIndex];
  const total = series.totals[lastIndex];
  assertEqual(returning, 1, "Weekly returning users");
  assertEqual(total, 2, "Weekly active users");
  assertEqual(formatPercent(returning, total), "50.0%", "Weekly returning percentage");
}

function runMonthlyCase() {
  const timeline = [
    { label: "2025-W01", date: new Date(Date.UTC(2025, 0, 5)), users: new Set(["U1", "U2"]) },
    { label: "2025-W02", date: new Date(Date.UTC(2025, 0, 12)), users: new Set(["U1", "U3"]) },
    { label: "2025-W05", date: new Date(Date.UTC(2025, 1, 2)), users: new Set(["U1", "U2"]) },
    { label: "2025-W06", date: new Date(Date.UTC(2025, 1, 9)), users: new Set(["U1", "U4"]) }
  ];
  const series = generateReturningSeries(timeline, "monthly");
  const lastIndex = series.labels.length - 1;
  const returning = series.returningCounts[lastIndex];
  const total = series.totals[lastIndex];
  assertEqual(returning, 2, "Monthly returning users");
  assertEqual(total, 3, "Monthly active users");
  assertEqual(formatPercent(returning, total), "66.7%", "Monthly returning percentage");
}

try {
  runWeeklyCase();
  runMonthlyCase();
  console.log("PASS verify-returning-users");
} catch (error) {
  console.error(`FAIL verify-returning-users: ${error.message}`);
  process.exitCode = 1;
}
