import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import FoodImage from '../shared/ui/FoodImage';
import {foodImageKey} from '../shared/ui/foodImages';
afterEach(()=>{cleanup();vi.useRealTimers()});
it('maps case, whitespace, plurals and aliases',()=>{for(const [name,key] of [[' TOMATOES ','tomato'],['Whole   Milk','milk'],['Egg','eggs'],['cheddar cheese','cheese'],['Carrots','carrot'],['BHINDI','okra'],['aubergines','eggplant'],['palak','spinach']])expect(foodImageKey(name)).toBe(key)});
it('loads local photographs lazily and changes with names',()=>{const view=render(<FoodImage name="Milk"/>);expect(screen.getByRole('img').getAttribute('src')).toBe('/foods/milk.webp');expect(screen.getByRole('img').getAttribute('loading')).toBe('lazy');view.rerender(<FoodImage name="Apple"/>);expect(screen.getByRole('img').getAttribute('src')).toBe('/foods/apple.webp')});
it('handles unknown and broken images without retry loops',()=>{const view=render(<FoodImage name="Mystery food"/>);expect(screen.getByRole('img').getAttribute('aria-label')).toContain('No reference photo');view.rerender(<FoodImage name="Milk"/>);fireEvent.error(screen.getByRole('img'));expect(screen.getByRole('img').getAttribute('aria-label')).toBe('No reference photo for Milk');view.rerender(<FoodImage name="Eggs"/>);expect(screen.getByRole('img').getAttribute('src')).toBe('/foods/eggs.webp')});
it('matches the six missing foods and their aliases without matching unrelated dishes',()=>{
 for(const [name,key] of [['Red Bell Peppers','red-bell-pepper'],['organic fresh red-capsicums','red-bell-pepper'],['Yellow Bell Pepper','yellow-bell-pepper'],['yellow capsicum','yellow-bell-pepper'],['Oranges','orange'],['Kale','kale'],['Cabbages','cabbage'],['Cucumbers','cucumber'],['KHEERA','cucumber'],['patta gobhi','cabbage']]) expect(foodImageKey(name)).toBe(key);
 for(const name of ['orange juice','red cabbage','green bell pepper','kale soup','cucumber dressing','__proto__']) expect(foodImageKey(name)).toBeUndefined();
});
it('shares failure backoff across card/table remounts and allows a later retry',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2030-01-01'));
 const view=render(<FoodImage name="Kale"/>);fireEvent.error(screen.getByRole('img'));view.unmount();
 const again=render(<FoodImage name="curly kale"/>);expect(screen.getByRole('img').getAttribute('src')).toBeNull();
 vi.advanceTimersByTime(300001);again.rerender(<FoodImage name="Kale leaves"/>);
 expect(screen.getByRole('img').getAttribute('src')).toBe('/foods/kale.webp');
});
