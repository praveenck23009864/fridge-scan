import {afterEach, expect, it, vi} from 'vitest';
import {cleanup, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from '../features/dashboard/Dashboard';
import {api} from '../services/api';

vi.mock('../services/api', () => ({api: {getScans: vi.fn(), getScanItems: vi.fn()}}));
afterEach(() => {cleanup(); vi.resetAllMocks();});

it('puts the banner first, counts the whole current snapshot, and limits only the preview', async () => {
  vi.mocked(api.getScans).mockResolvedValue([{id:1,status:'reviewed',is_mock:false,model_used:null},{id:3,status:'pending',is_mock:false,model_used:null},{id:2,status:'reviewed',is_mock:false,model_used:null}]);
  vi.mocked(api.getScanItems).mockResolvedValue(Array.from({length:13}, (_,index) => ({id:index,scan_id:2,name:`Food ${index}`,confirmed:index!==12,stock_status:index<4?'low':'available'})));
  render(<Dashboard revision={0} pending={7} shoppingError="" onRetryShopping={()=>{}}/>);
  await screen.findByText('6 of 12 current ingredients', {exact:false});
  expect(api.getScanItems).toHaveBeenCalledWith(2);
  expect(screen.getByRole('region', {name:'Dashboard'}).firstElementChild?.className).toBe('welcome-card');
  expect(within(screen.getByRole('article',{name:'Inventory ingredients'})).getByText('12')).toBeTruthy();
  expect(within(screen.getByRole('article',{name:'Available ingredients'})).getByText('8')).toBeTruthy();
  expect(within(screen.getByRole('article',{name:'Running low'})).getByText('4')).toBeTruthy();
  expect(within(screen.getByRole('article',{name:'Pending shopping items'})).getByText('7')).toBeTruthy();
  expect(screen.getByRole('region',{name:'A peek inside your fridge'}).querySelectorAll('article')).toHaveLength(6);
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.queryByLabelText('Search food')).toBeNull();
  expect(screen.getByRole('link',{name:'View all ingredients'}).getAttribute('href')).toBe('/inventory');
});

it('shows unavailable counts instead of false zeros and retries connection errors', async () => {
  vi.mocked(api.getScans).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
  render(<Dashboard revision={0} pending={null} shoppingError="offline" onRetryShopping={()=>{}}/>);
  await screen.findByText(/Could not load saved inventory/);
  expect(within(screen.getByRole('article',{name:'Inventory ingredients'})).getByText('—')).toBeTruthy();
  await userEvent.click(screen.getByRole('button',{name:'Retry inventory'}));
  await screen.findByText('No ingredients saved yet.', {exact:false});
  expect(within(screen.getByRole('article',{name:'Inventory ingredients'})).getByText('0')).toBeTruthy();
});
