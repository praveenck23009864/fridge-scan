import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { api, analyzeFridgePhotos, getFridgeSuggestions } from "./services/api";

vi.mock("./services/api", () => ({
  analyzeFridgePhotos: vi.fn(),
  getFridgeSuggestions: vi.fn().mockResolvedValue({scan_id:null,is_mock:false,items:[]}),
  api: { getLists: vi.fn(), getScans: vi.fn(), health: vi.fn() },
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getFridgeSuggestions).mockResolvedValue({scan_id:null,is_mock:false,items:[]});
  vi.mocked(api.getLists).mockResolvedValue([]);
  vi.mocked(api.getScans).mockResolvedValue([]);
  vi.mocked(api.health).mockResolvedValue({ status: "success", database: "SQLite", ai: "GroqCloud", mock_vision: false });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["sample"], { type: "image/jpeg" }) }));
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:sample"), revokeObjectURL: vi.fn() }));
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("preserves sample loading and deletion, and displays real AI errors without mock data", async () => {
  vi.mocked(analyzeFridgePhotos).mockRejectedValue(new Error("Vision models are rate limited. Please try again later."));
  const user = userEvent.setup(); render(<App />);
  await user.click(screen.getByRole("button", { name: "No camera? Use Sample Photos" }));
  await screen.findByText("Photos selected: 3/3");
  await user.click(screen.getAllByRole("button", { name: "Delete" })[0]);
  expect(screen.getByText("Photos selected: 2/3")).toBeTruthy();
  await user.click(screen.getByRole("checkbox", { name: /I consent/ }));
  await user.click(screen.getByRole("button", { name: "Analyze with AI" }));
  expect((await screen.findByRole("alert")).textContent).toContain("rate limited");
  expect(screen.queryByText("Development mock results.")).toBeNull();
  expect(screen.queryByLabelText("Food name 1")).toBeNull();
  expect(analyzeFridgePhotos).toHaveBeenCalledWith(expect.arrayContaining([expect.any(File)]), true);
});

it("announces explicit mock mode and renders its review results", async () => {
  vi.mocked(api.health).mockResolvedValue({ status: "success", database: "SQLite", ai: "Mock", mock_vision: true });
  vi.mocked(analyzeFridgePhotos).mockResolvedValue({ is_mock: true, model_used: "development-mock", items: [{ name: "Milk", stock_status: "low" }] });
  const user = userEvent.setup(); render(<App />);
  await screen.findByText("Development mock mode is enabled.");
  await user.click(screen.getByRole("button", { name: "No camera? Use Sample Photos" }));
  await user.click(screen.getByRole("checkbox", { name: /I consent/ }));
  await user.click(screen.getByRole("button", { name: "Analyze with development mock" }));
  await screen.findByText("Development mock results.");
  await waitFor(() => expect((screen.getByLabelText("Food name 1") as HTMLInputElement).value).toBe("Milk"));
});
