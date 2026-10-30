import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Inventory from '../features/inventory/Inventory';
import {api} from '../services/api';
vi.mock('../services/api',()=>({api:{getScans:vi.fn(),getScanItems:vi.fn(),createScan:vi.fn(),saveReview:vi.fn()}}));
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.resetAllMocks()});
it('excludes drafts and searches saved stock without changing it',async()=>{
 vi.mocked(api.getScans).mockResolvedValue([{id:1,status:'reviewed',is_mock:false,model_used:null}]);
 vi.mocked(api.getScanItems).mockResolvedValue([{id:1,scan_id:1,name:'Milk',confirmed:true,stock_status:'low'},{id:2,scan_id:1,name:'Draft',confirmed:false,stock_status:'available'}]);
 render(<Inventory revision={0}/>);await screen.findByRole('heading',{name:'Milk'});expect(screen.queryByText('Draft')).toBeNull();
 await userEvent.type(screen.getByLabelText('Search food'),'rice');expect(screen.queryByRole('heading',{name:'Milk'})).toBeNull();
});
const savedScan={id:3,status:'reviewed',is_mock:false,model_used:null};
const inventoryRows=[{id:1,scan_id:3,name:'Milk',confirmed:true,stock_status:'low' as const,category:'Dairy'},{id:2,scan_id:3,name:'Bananas',confirmed:true,stock_status:'available' as const,category:'Fruits'}];
function seedInventory(){vi.mocked(api.getScans).mockResolvedValue([savedScan]);vi.mocked(api.getScanItems).mockResolvedValue(inventoryRows);vi.mocked(api.createScan).mockResolvedValue({...savedScan,id:4});}
it('places the table editor immediately below its row, retains failed edits and saves through the existing API',async()=>{
 seedInventory();vi.mocked(api.saveReview).mockRejectedValueOnce(new Error('Save unavailable')).mockResolvedValueOnce([{...inventoryRows[0],scan_id:4},{...inventoryRows[1],scan_id:4,name:'Banana',category:'Other'}]);
 render(<Inventory revision={0}/>);const user=userEvent.setup();await screen.findByRole('heading',{name:'Bananas'});
 await user.click(screen.getByRole('button',{name:'Switch to table view'}));await user.click(screen.getByRole('button',{name:'Edit Bananas'}));
 const row=screen.getByRole('row',{name:/Bananas/});const form=screen.getByRole('form',{name:'Edit ingredient'});
 expect(row.nextElementSibling?.contains(form)).toBe(true);expect(screen.getAllByRole('form')).toHaveLength(1);
 await user.clear(within(form).getByLabelText('Ingredient name'));await user.type(within(form).getByLabelText('Ingredient name'),'Banana');await user.selectOptions(within(form).getByLabelText('Ingredient category'),'Other');
 await user.click(within(form).getByRole('button',{name:'Save ingredient'}));await within(form).findByRole('alert');
 expect((within(form).getByLabelText('Ingredient name') as HTMLInputElement).value).toBe('Banana');
 expect((within(form).getByLabelText('Ingredient category') as HTMLSelectElement).value).toBe('Other');
 await user.click(within(form).getByRole('button',{name:'Save ingredient'}));await screen.findByRole('button',{name:'Edit Banana'});
 expect(screen.queryByRole('form',{name:'Edit ingredient'})).toBeNull();
 expect(api.saveReview).toHaveBeenLastCalledWith(4,[{name:'Milk',stock_status:'low',category:'Dairy',confirmed:true},{name:'Banana',stock_status:'available',category:'Other',confirmed:true}]);
});
it('expands a single editor inside its card, cancels with Escape or Cancel, and preserves filters',async()=>{
 seedInventory();render(<Inventory revision={0}/>);const user=userEvent.setup();await screen.findByRole('heading',{name:'Bananas'});
 await user.click(screen.getByRole('button',{name:'Edit Milk'}));await user.click(screen.getByRole('button',{name:'Edit Bananas'}));
 expect(screen.getAllByRole('form')).toHaveLength(1);const form=screen.getByRole('form',{name:'Edit ingredient'});
 expect(screen.getByRole('heading',{name:'Bananas'}).closest('article')?.contains(form)).toBe(true);
 await user.type(within(form).getByLabelText('Ingredient name'),' changed');await user.keyboard('{Escape}');
 expect(screen.queryByRole('form')).toBeNull();expect(document.activeElement).toBe(screen.getByRole('button',{name:'Edit Bananas'}));
 await user.type(screen.getByLabelText('Search food'),'Ban');await user.selectOptions(screen.getByLabelText('Category filter'),'Fruits');
 await user.click(screen.getByRole('button',{name:'Edit Bananas'}));await user.click(screen.getByRole('button',{name:'Cancel'}));
 expect((screen.getByLabelText('Search food') as HTMLInputElement).value).toBe('Ban');expect((screen.getByLabelText('Category filter') as HTMLSelectElement).value).toBe('Fruits');expect(api.saveReview).not.toHaveBeenCalled();
});
it('saves manual categories in a new snapshot and confirms deletion',async()=>{
 const scan={id:1,status:'reviewed',is_mock:false,model_used:null};
 vi.mocked(api.getScans).mockResolvedValue([scan]);vi.mocked(api.getScanItems).mockResolvedValue([]);
 vi.mocked(api.createScan).mockResolvedValue({...scan,id:2});
 vi.mocked(api.saveReview).mockResolvedValueOnce([{id:5,scan_id:2,name:'Apple',confirmed:true,stock_status:'available',category:'Fruits'}]).mockResolvedValueOnce([]);
 render(<Inventory revision={0}/>);const user=userEvent.setup();await user.click(await screen.findByRole('button',{name:'Add ingredient'}));
 await user.type(screen.getByLabelText('Ingredient name'),'Apple');await user.selectOptions(screen.getByLabelText('Ingredient stock'),'available');await user.selectOptions(screen.getByLabelText('Ingredient category'),'Fruits');
 await user.click(screen.getByRole('button',{name:'Save ingredient'}));await screen.findByRole('heading',{name:'Apple'});
 expect(api.saveReview).toHaveBeenCalledWith(2,[{name:'Apple',stock_status:'available',category:'Fruits',confirmed:true}]);
 vi.spyOn(window,'confirm').mockReturnValue(false);await user.click(screen.getByRole('button',{name:'Delete Apple'}));expect(api.saveReview).toHaveBeenCalledTimes(1);
 vi.spyOn(window,'confirm').mockReturnValue(true);await user.click(screen.getByRole('button',{name:'Delete Apple'}));await screen.findByText('No ingredients match these filters.');expect(api.saveReview).toHaveBeenLastCalledWith(2,[]);vi.restoreAllMocks();
});

