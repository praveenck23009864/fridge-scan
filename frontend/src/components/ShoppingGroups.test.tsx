import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import ShoppingGroups from '../features/shopping-lists/ShoppingGroups';
afterEach(cleanup);
it('groups pending and completed groceries under their category',()=>{
 render(<ShoppingGroups list={{id:1,name:'Weekly',items:[{id:1,shopping_list_id:1,name:'Milk',quantity:1,completed:false,category:'Dairy'},{id:2,shopping_list_id:1,name:'Cheese',quantity:1,completed:true,category:'Dairy'}]}} onRefresh={vi.fn()} onDelete={vi.fn()} onToggle={vi.fn()}/>);
 expect(screen.getByRole('region',{name:'Dairy groceries'})).toBeTruthy();expect(screen.getByRole('heading',{name:'Pending'})).toBeTruthy();expect(screen.getByRole('heading',{name:'Completed'})).toBeTruthy();
});
