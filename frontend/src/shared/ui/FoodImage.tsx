import {useSyncExternalStore} from 'react';
import './FoodImage.css';
import {foodImageKey} from './foodImages';
import {imageFailed, rememberImageFailure, subscribeImageFailures} from './foodImageFailures';
export default function FoodImage({name}:{name:string}){
 const key=foodImageKey(name);
 const failed=useSyncExternalStore(subscribeImageFailures, () => imageFailed(key), () => false);
 return key&&!failed?<img className="food-image" src={`/foods/${key}.webp`} alt={`Reference photograph of ${name} (not your fridge)`} width={128} height={128} loading="lazy" decoding="async" onError={()=>rememberImageFailure(key)}/>:<div className="food-image food-placeholder" role="img" aria-label={`No reference photo for ${name}`}><span>No image</span></div>;
}
