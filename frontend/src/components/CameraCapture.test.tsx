import {afterEach,expect,it,vi} from 'vitest';
import {cleanup,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CameraCapture from '../features/fridge-scan/CameraCapture';
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('stops a camera stream that resolves after unmount',async()=>{
 let resolve!:(stream:MediaStream)=>void;
 const stop=vi.fn();const get=vi.fn(()=>new Promise<MediaStream>(r=>{resolve=r;}));
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:get}});
 const user=userEvent.setup();const view=render(<CameraCapture onPhotosChange={vi.fn()}/>);
 await user.click(screen.getByRole('button',{name:'Open Camera'}));view.unmount();
 resolve({getTracks:()=>[{stop}]} as unknown as MediaStream);
 await waitFor(()=>expect(stop).toHaveBeenCalledOnce());
});
it('revokes selected photo previews on unmount',async()=>{
 const revoke=vi.fn();vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:vi.fn(()=> 'blob:fixture'),revokeObjectURL:revoke}));
 const user=userEvent.setup();const view=render(<CameraCapture onPhotosChange={vi.fn()}/>);
 await user.upload(screen.getByLabelText('Upload Photos'),new File(['photo'],'photo.jpg',{type:'image/jpeg'}));
 view.unmount();expect(revoke).toHaveBeenCalledWith('blob:fixture');
});
