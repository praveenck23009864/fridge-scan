import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ScanReview from "./ScanReview";
import { api, type AIAnalysisResponse, type DetectedItem, type FridgeScan } from "../services/api";

vi.mock("../services/api", () => ({ api: {
  getScans: vi.fn(), getScanItems: vi.fn(), createScan: vi.fn(), saveReview: vi.fn(), saveScanToList: vi.fn(),
} }));

const analysis: AIAnalysisResponse = { is_mock: true, model_used: "development-mock", items: [
  { name: "Milk", stock_status: "low" }, { name: "Eggs", stock_status: "available" },
  { name: "Wrong detection", stock_status: "unknown" },
] };
const scan: FridgeScan = { id: 7, status: "reviewed", is_mock: true, model_used: "development-mock" };
const saved: DetectedItem[] = [{ id: 11, scan_id: 7, name: "Milk", stock_status: "low", confirmed: true }];
const callback = vi.fn();
function show(value: AIAnalysisResponse | null = analysis) {
  return render(<ScanReview analysis={value} onDirtyChange={vi.fn()} onBusyChange={vi.fn()} onShoppingListCreated={callback} />);
}
function input(label: string) { return screen.getByLabelText(label) as HTMLInputElement; }
function button(name: string) { return screen.getByRole("button", { name }) as HTMLButtonElement; }
async function ready() { await waitFor(() => expect(screen.queryByText("Loading saved scans…")).toBeNull()); }

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getScans).mockResolvedValue([]);
  vi.mocked(api.createScan).mockResolvedValue(scan);
  vi.mocked(api.getScanItems).mockResolvedValue(saved);
  vi.mocked(api.saveReview).mockImplementation(async (id, items) => items.map((item, index) => ({ ...item, id: item.id ?? 20 + index, scan_id: id, stock_status: item.stock_status ?? "unknown" })));
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(cleanup);

describe("review food items", () => {
  it("labels mock results, edits names/status, adds/deletes and saves only confirmed items", async () => {
    const user = userEvent.setup(); show(); await ready();
    expect(screen.getByText("Development mock results.")).toBeTruthy();
    expect(button("Save confirmed items").disabled).toBe(true);
    await user.clear(input("Food name 1")); await user.type(input("Food name 1"), "Oat milk");
    await user.selectOptions(screen.getByLabelText("Stock status 1"), "available");
    await user.click(input("Confirm item 1"));
    await user.click(button("Delete item 3"));
    await user.type(input("Missing food name"), "Tomatoes");
    await user.selectOptions(screen.getByLabelText("Missing food stock status"), "low");
    await user.click(button("Add missing item"));
    await user.click(input("Confirm item 3"));
    await user.click(button("Save confirmed items"));
    await screen.findByText(/Saved 2 confirmed item/);
    expect(api.createScan).toHaveBeenCalledWith({ is_mock: true, model_used: "development-mock" });
    expect(api.saveReview).toHaveBeenCalledWith(7, [
      { id: undefined, name: "Oat milk", stock_status: "available", confirmed: true },
      { id: undefined, name: "Tomatoes", stock_status: "low", confirmed: true },
    ]);
    expect(input("Food name 2").value).toBe("Eggs");
    expect(screen.getByText(/1 unchecked item\(s\) remain unsaved drafts/)).toBeTruthy();
  });

  it("requires confirmation again after editing a confirmed item", async () => {
    const user = userEvent.setup(); show(); await ready();
    await user.click(input("Confirm item 1")); expect(input("Confirm item 1").checked).toBe(true);
    await user.selectOptions(screen.getByLabelText("Stock status 1"), "unknown");
    expect(input("Confirm item 1").checked).toBe(false);
    await user.clear(input("Food name 1"));
    expect(input("Confirm item 1").disabled).toBe(true);
  });

  it("retains edits after a failed save and reuses the allocated scan on retry", async () => {
    vi.mocked(api.saveReview).mockRejectedValueOnce(new Error("Database unavailable"));
    const user = userEvent.setup(); show(); await ready();
    await user.click(input("Confirm item 1")); await user.click(button("Save confirmed items"));
    expect((await screen.findByRole("alert")).textContent).toContain("Database unavailable");
    expect(input("Food name 1").value).toBe("Milk");
    expect(input("Confirm item 1").checked).toBe(true);
    await user.click(button("Save confirmed items")); await screen.findByText(/Saved 1 confirmed item/);
    expect(api.createScan).toHaveBeenCalledTimes(1);
    expect(api.saveReview).toHaveBeenCalledTimes(2);
  });

  it("restores a saved review on reload with its mock provenance and item IDs", async () => {
    vi.mocked(api.getScans).mockResolvedValue([scan]);
    const first = show(null); await ready();
    expect(input("Food name 1").value).toBe("Milk");
    first.unmount(); show(null); await ready();
    expect(input("Confirm item 1").checked).toBe(true);
    expect(screen.getByText("Development mock results.")).toBeTruthy();
    const user = userEvent.setup();
    await user.clear(input("Food name 1")); await user.type(input("Food name 1"), "Skim milk");
    await user.click(input("Confirm item 1")); await user.click(button("Save confirmed items"));
    await screen.findByText(/Saved 1 confirmed item/);
    expect(api.saveReview).toHaveBeenCalledWith(7, [{ id: 11, name: "Skim milk", stock_status: "low", confirmed: true }]);
    expect(api.createScan).not.toHaveBeenCalled();
  });

  it("deletes a saved detection through an empty atomic snapshot", async () => {
    vi.mocked(api.getScans).mockResolvedValue([scan]);
    const user = userEvent.setup(); show(null); await ready();
    await user.click(button("Delete item 1")); await user.click(button("Save confirmed items"));
    await screen.findByText(/Saved 0 confirmed item/);
    expect(api.saveReview).toHaveBeenCalledWith(7, []);
    expect(button("Create shopping list from low-stock items").disabled).toBe(true);
  });

  it("converts only a saved review and displays conversion errors without losing it", async () => {
    vi.mocked(api.getScans).mockResolvedValue([scan]);
    vi.mocked(api.saveScanToList).mockRejectedValueOnce(new Error("Cannot create list"))
      .mockResolvedValue({ id: 12, name: "DEMO - Fridge scan #7", is_mock: true, source_scan_id: 7, items: [] });
    const user = userEvent.setup(); show(null); await ready();
    await user.click(button("Create shopping list from low-stock items"));
    expect((await screen.findByRole("alert")).textContent).toContain("Cannot create list");
    await user.click(button("Create shopping list from low-stock items"));
    await screen.findByText(/Shopping list.*is ready below/);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: 12, is_mock: true }));
    await user.selectOptions(screen.getByLabelText("Stock status 1"), "unknown");
    expect(button("Create shopping list from low-stock items").disabled).toBe(true);
  });

  it("protects unsaved edits when opening another scan", async () => {
    vi.mocked(api.getScans).mockResolvedValue([scan]); vi.mocked(window.confirm).mockReturnValue(false);
    const user = userEvent.setup(); show(); await ready();
    await user.click(screen.getByText("Saved scans (1)"));
    await user.click(button("DEMO · Scan #7 · reviewed"));
    expect(window.confirm).toHaveBeenCalled(); expect(api.getScanItems).not.toHaveBeenCalled();
    expect(input("Food name 3").value).toBe("Wrong detection");
  });

  it("can retry loading scan history after a network error", async () => {
    vi.mocked(api.getScans).mockRejectedValueOnce(new Error("Offline")).mockResolvedValue([scan]);
    const user = userEvent.setup(); show(null); await ready();
    expect(screen.getByRole("alert").textContent).toContain("Offline");
    await user.click(screen.getByText("Saved scans (0)"));
    await user.click(button("Refresh saved scans"));
    await screen.findByRole("button", { name: "DEMO · Scan #7 · reviewed" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not label real recognition as mock", async () => {
    show({ ...analysis, is_mock: false, model_used: "real-vision" }); await ready();
    expect(screen.queryByText("Development mock results.")).toBeNull();
    expect(screen.getByText(/AI recognition · real-vision/)).toBeTruthy();
  });
});
