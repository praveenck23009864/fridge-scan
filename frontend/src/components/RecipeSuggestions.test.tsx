import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecipeSuggestions from './RecipeSuggestions';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const result = { model_used: 'test', is_mock: false, recipes: [{ name: 'Vegetable curry', servings: 4, cooking_time_minutes: 30, difficulty: 'easy', available_ingredients: [{ name: 'Tomato', quantity: '2' }], missing_ingredients: [], instructions: ['Cook vegetables.'] }] };
describe('recipe preferences', () => {
    it('selects preferences without generating and sends the complete payload on click', async () => {
        const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => result }); vi.stubGlobal('fetch', fetch);
        const user = userEvent.setup(); render(<RecipeSuggestions scanId={7} />);
        await user.click(screen.getByRole('radio', { name: 'Vegan' }));
        await user.click(screen.getByRole('radio', { name: 'South Indian' }));
        await user.click(screen.getByRole('radio', { name: 'Mild' }));
        await user.clear(screen.getByLabelText('Servings')); await user.type(screen.getByLabelText('Servings'), '4');
        await user.selectOptions(screen.getByLabelText('Maximum cooking time'), '45');
        await user.type(screen.getByLabelText(/Allergies/), 'peanuts, mushrooms');
        expect(fetch).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Generate Recipes' }));
        await screen.findByText('Vegetable curry');
        expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ scan_id: 7, servings: 4, dietary_preferences: 'Vegan', max_time: 45, cuisine: 'South Indian', spice_level: 'Mild', excluded_ingredients: 'peanuts, mushrooms' });
    });
    it('supports native radio keyboard selection', async () => {
        const user = userEvent.setup(); render(<RecipeSuggestions scanId={null} />);
        const any = within(screen.getByRole('group', { name: 'Dietary preference' })).getByRole('radio', { name: 'Any' });
        any.focus(); await user.keyboard('{ArrowRight}');
        expect((screen.getByRole('radio', { name: 'Vegetarian' }) as HTMLInputElement).checked).toBe(true);
        expect((screen.getByRole('button', { name: 'Generate Recipes' }) as HTMLButtonElement).disabled).toBe(true);
    });
    it('disables invalid servings and restores valid selection', async () => {
        const user = userEvent.setup(); render(<RecipeSuggestions scanId={7} />);
        const input = screen.getByLabelText('Servings'); await user.clear(input); await user.type(input, '13');
        expect((screen.getByRole('button', { name: 'Generate Recipes' }) as HTMLButtonElement).disabled).toBe(true);
        await user.clear(input); await user.type(input, '12');
        expect((screen.getByRole('button', { name: 'Generate Recipes' }) as HTMLButtonElement).disabled).toBe(false);
    });
    it('shows loading, recovers from errors, and preserves recipe cards', async () => {
        let resolve!: (value: unknown) => void;
        const fetch = vi.fn().mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValueOnce({ ok: true, json: async () => result }); vi.stubGlobal('fetch', fetch);
        const user = userEvent.setup(); render(<RecipeSuggestions scanId={7} />);
        await user.click(screen.getByRole('button', { name: 'Generate Recipes' }));
        expect((screen.getByRole('button', { name: 'Generating...' }) as HTMLButtonElement).disabled).toBe(true);
        resolve({ ok: false, json: async () => ({ detail: 'Provider unavailable' }) });
        await screen.findByRole('alert'); await user.click(screen.getByRole('button', { name: 'Generate Recipes' }));
        await screen.findByText('Vegetable curry'); await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    });
    it('supports any time and empty results', async () => {
        const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...result, recipes: [] }) }); vi.stubGlobal('fetch', fetch);
        const user = userEvent.setup(); render(<RecipeSuggestions scanId={7} />);
        await user.selectOptions(screen.getByLabelText('Maximum cooking time'), ''); await user.click(screen.getByRole('button', { name: 'Generate Recipes' }));
        await screen.findByText(/No recipes match/); expect(JSON.parse(fetch.mock.calls[0][1].body).max_time).toBeNull();
    });
});
