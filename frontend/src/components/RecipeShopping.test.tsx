import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecipeShopping from '../features/recipes/RecipeShopping';
import {api,bulkShoppingItems} from '../services/api';
vi.mock('../services/api',()=>({api:{getLists:vi.fn()},bulkShoppingItems:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks()});
it('requires explicit list and ingredient approval and recovers from failure',async()=>{
 vi.mocked(api.getLists).mockResolvedValue([{id:7,name:'Weekly',items:[]}]);
 vi.mocked(bulkShoppingItems).mockRejectedValueOnce(new Error('Try again')).mockResolvedValueOnce({id:7,name:'Weekly',items:[]});
 const done=vi.fn();render(<RecipeShopping items={[{name:'Milk',quantity:'1 cup'}]} onSaved={done}/>);const user=userEvent.setup();
 await user.click(screen.getByRole('button',{name:'Add missing ingredients'}));await screen.findByRole('option',{name:'Weekly'});
 expect(bulkShoppingItems).not.toHaveBeenCalled();await user.selectOptions(screen.getByLabelText('Target shopping list'),'7');await user.click(screen.getByRole('checkbox'));await user.selectOptions(screen.getByLabelText('Shopping category'),'Dairy');
 await user.click(screen.getByRole('button',{name:'Add selected ingredients'}));await screen.findByRole('alert');
 await user.click(screen.getByRole('button',{name:'Add selected ingredients'}));await screen.findByRole('status');expect(bulkShoppingItems).toHaveBeenLastCalledWith(7,[{name:'Milk',category:'Dairy'}]);expect(done).toHaveBeenCalledOnce();
});
