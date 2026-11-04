// From Native Cook "Contact File Stack" (react-native/src/blocks/lists/contact-file-stack).
// Change: the copy and the two prints are props (defaults are the source's own content), so the
// Worker portfolio can show its projects; prints may be real photos. Motion and layout unchanged.
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Image, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useDerivedValue, useFrameCallback, useReducedMotion, useSharedValue, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

export const LOOP=9;
export type FileCard={title:string;line:string;footer:string};
type Copy={header:string;names:string[];selectedName:string;cards:[FileCard,FileCard,FileCard];prints:[string|null,string|null];hint:string};
type Props={autoPlay?:boolean;previewTime?:number}&Partial<Copy>;
const names=['Ari m.','Arden p.','Asa m.','Aster n.','Bryn','Bowie p.','Caro m.','Cedar p.','Cleo m.','Cove p.','Dara l.','Demi p.','Drew n.','Eden r.'];
function ease(a:number,b:number,t:number){'worklet';const x=Math.min(1,Math.max(0,(t-a)/(b-a)));return x*x*x*(10+x*(-15+6*x));}
function spring(u:number){'worklet';return u+.4*Math.sin(Math.PI*u)*Math.sin(Math.PI*u/2);}
function impact(){void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);}
function Folder({name,letter,width=353,height=138}:{name:string;letter?:string;width?:number;height?:number}){
  const path=`M0 16 Q0 0 12 4 H80 L112 28 H${width-12} Q${width} 28 ${width} 40 L${width-8} ${height-10} Q${width-8} ${height} ${width-20} ${height} H20 Q8 ${height} 8 ${height-10} Z`;
  return <View style={{width,height}}><Svg width={width} height={height} style={StyleSheet.absoluteFill}>{letter&&<Rect x={width-95} y={13} width={95} height={45} rx={6} fill="#11120E"/>}<Path d={path} fill="#C3C4B9" stroke="#85867C" strokeWidth={0.9}/><Path d={`M5 29 H${width-7}`} stroke="rgba(255,255,255,.25)" strokeWidth={1}/></Svg><Text style={styles.folderName}>{name}</Text>{letter&&<Text style={[styles.letter,{left:width-43}]}>{letter}</Text>}</View>;
}
// Rasterize the static paper and its copy together; only the outside wrapper moves.
const DEFAULT_CARDS:[FileCard,FileCard,FileCard]=[{title:'Bryn Hale',line:'Creative direction',footer:'bryn@quiet-studio.example'},{title:'Bryn Hale',line:'A note for later',footer:'bryn@quiet-studio.example'},{title:'Bryn Hale',line:'Studio / 04',footer:'bryn@quiet-studio.example'}];
function ContactCard({index,card}:{index:number;card:FileCard}){return <View collapsable={false} shouldRasterizeIOS renderToHardwareTextureAndroid needsOffscreenAlphaCompositing style={styles.card}><Text style={styles.cardTitle} numberOfLines={1}>{card.title}</Text><Text style={styles.cardLine} numberOfLines={2}>{card.line}</Text><Text style={styles.email} numberOfLines={1}>{card.footer}</Text><View style={[styles.stamp,{backgroundColor:index===1?'#ED7338':'#5C1FDE'}]}><View style={styles.stampInset}/></View></View>;}
function PhotoPrint({index,time,weight,uri}:{index:number;time:SharedValue<number>;weight:SharedValue<number>;uri:string|null}){
  const style=useAnimatedStyle(()=>{const t=time.get(),delay=index*.07,p=ease(3.7+delay,4.5+delay,t)*(1-ease(5.8+delay,6.5+delay,t))*weight.get();return{opacity:p,top:540-85*spring(p)+index*21,transform:[{scale:.82+.18*p},{rotate:`${(index===0?12:-10)+(index===0?16:-16)*(1-p)}deg`}]};});
  return <Animated.View style={[styles.print,{left:230+index*19},style]}>{uri?<Image source={{uri}} style={styles.landscape} resizeMode="cover"/>:<><LinearGradient colors={['#4D8091','#C7C49E']} style={styles.landscape}/><Svg width={90} height={110} style={StyleSheet.absoluteFill}><Path d="M6 70 L32 36 L48 60 L64 44 L84 78 Z" fill="#334033"/></Svg></>}</Animated.View>;
}
function FileRow({index,time,weight,names}:{index:number;time:SharedValue<number>;weight:SharedValue<number>;names:string[]}){
  const style=useAnimatedStyle(()=>{const t=time.get(),w=weight.get(),c=ease(1.3,2.1,t)*(1-ease(7.8,8.4,t))*w,o=ease(2.2,3,t)*(1-ease(7,7.8,t))*w,hide=ease(2.2+index*.025,2.9+index*.025,t)*(1-ease(7,7.8,t))*w;return{top:240+240*c+index*(39-17*c)+(index===4?0:180*hide),opacity:index===4?1-o:1-hide};});
  const letter=[0,4,6,10].includes(index)?index<4?'A':index<6?'B':index<10?'C':'D':undefined;
  return <Animated.View style={[styles.row,{zIndex:index},style]}><Folder name={names[index]??''} letter={letter}/></Animated.View>;
}
function LiftedCard({index,time,weight,card}:{index:number;time:SharedValue<number>;weight:SharedValue<number>;card:FileCard}){
  const style=useAnimatedStyle(()=>{const t=time.get(),d=index*.055,w=weight.get(),lift=spring(ease(3+d,3.85+d,t))*(1-ease(6.05+d,6.95+d,t))*w,fan=ease(3.35+d,4.1+d,t)*(1-ease(6.05+d,6.95+d,t))*w;return{left:62+index*5+index*18*fan,top:32+index*7-140*lift-index*12*fan,transform:[{rotate:`${-2+(-10+index*8.5)*fan}deg`}]};});
  return <Animated.View collapsable={false} style={[{position:'absolute',width:232,height:126,zIndex:3-index,isolation:'isolate'},style]}><ContactCard index={index} card={card}/></Animated.View>;
}
function SelectedFile({time,weight,name,cards}:{time:SharedValue<number>;weight:SharedValue<number>;name:string;cards:[FileCard,FileCard,FileCard]}){
  const style=useAnimatedStyle(()=>{const t=time.get(),w=weight.get(),c=ease(1.3,2.1,t)*(1-ease(7.8,8.4,t))*w,o=ease(2.2,3,t)*(1-ease(7,7.8,t))*w;return{left:20+2*o,top:(240+240*c+4*(39-17*c))*(1-o)+338*o,opacity:o,zIndex:20};});
  const back=useAnimatedStyle(()=>{const t=time.get(),w=weight.get(),o=ease(2.2,3,t)*(1-ease(7,7.8,t))*w,drop=ease(3.7,4.4,t)*(1-ease(5.8,6.5,t))*w;return{height:138+107*o,top:312*drop};});
  const front=useAnimatedStyle(()=>{const t=time.get(),w=weight.get(),drop=ease(3.7,4.4,t)*(1-ease(5.8,6.5,t))*w,o=ease(2.2,3,t)*(1-ease(7,7.8,t))*w;return{top:28+35*o+312*drop,height:110+70*o};});
  // The hinge transforms inside a flat front layer, above the three paper surfaces.
  const frontFace=useAnimatedStyle(()=>{const t=time.get(),w=weight.get(),drop=ease(3.7,4.4,t)*(1-ease(5.8,6.5,t))*w,o=ease(2.2,3,t)*(1-ease(7,7.8,t))*w;return{transform:[{perspective:850},{rotateX:`${22*o*(1-drop)}deg`}]};});
  return <Animated.View collapsable={false} style={[styles.selected,style]}><Animated.View style={[{zIndex:0,position:'absolute',width:349,overflow:'hidden'},back]}><Folder name={name} width={349} height={245}/></Animated.View>{[2,1,0].map(i=><LiftedCard key={i} index={i} time={time} weight={weight} card={cards[i]}/>)}<Animated.View collapsable={false} style={[styles.frontFrame,front]}><Animated.View style={[styles.front,{transformOrigin:'top center'},frontFace]}/></Animated.View></Animated.View>;
}
export function ContactFileStack({autoPlay=false,previewTime,header='contact files',names:rows=names,selectedName='Bryn',cards=DEFAULT_CARDS,prints=[null,null],hint='14 PEOPLE / ONE PLACE'}:Props){
  const reduced=useReducedMotion(),[size,setSize]=useState({width:393,height:852});
  const clock=useSharedValue(0),last=useSharedValue(-1),manual=useSharedValue(0),origin=useSharedValue(0),touching=useSharedValue(false),dragBase=useSharedValue(0),velocity=useSharedValue(0),tapRun=useSharedValue(false);
  const time=useDerivedValue(()=>{if(previewTime!==undefined)return previewTime%LOOP;if(reduced)return 5;const d=last.get()<0?-1:clock.get()-last.get();if(touching.get())return manual.get();if(d>=0&&d<2.7)return Math.min(8.3,Math.max(0,manual.get()+(tapRun.get()?Math.min(3.4,d*3):velocity.get()*.16*(1-Math.exp(-d/.16)))));return autoPlay?(d>=2.7?d-2.7:clock.get())%LOOP:0;});
  const weight=useDerivedValue(()=>{const d=clock.get()-last.get();return previewTime!==undefined||reduced||touching.get()||last.get()<0||d>=2.7?1:1-ease(2,2.7,d);});
  useFrameCallback(frame=>{if(origin.get()===0)origin.set(frame.timestamp);clock.set((frame.timestamp-origin.get())/1000);},!reduced&&previewTime===undefined);
  const gesture=Gesture.Race(Gesture.Pan().minDistance(8).onStart(()=>{dragBase.set(time.get());manual.set(time.get());velocity.set(0);tapRun.set(false);touching.set(true);last.set(clock.get());}).onUpdate(event=>{manual.set(Math.min(8.3,Math.max(0,dragBase.get()-event.translationY/(90*size.width/393))));last.set(clock.get());}).onEnd(event=>{velocity.set(Math.min(3,Math.max(-3,-event.velocityY/(90*size.width/393))));}).onFinalize(()=>{if(touching.get()){touching.set(false);last.set(clock.get());}}),Gesture.Tap().onEnd(()=>{tapRun.set(true);velocity.set(0);manual.set(1.3);last.set(clock.get());scheduleOnRN(impact);}));
  const hintStyle=useAnimatedStyle(()=>({opacity:1-ease(2.2,3,time.get())*(1-ease(7,7.8,time.get()))*weight.get()}));
  const s=size.width/393,h=size.height/s;
  return <View style={styles.screen} onLayout={(event:LayoutChangeEvent)=>setSize(event.nativeEvent.layout)} accessibilityLabel={`${header}. Tap a file to open ${selectedName}'s cards, or drag to unfold the stack.`}><StatusBar style="dark"/><GestureDetector gesture={gesture}><Animated.View style={{width:393,height:h,transform:[{scale:s}],transformOrigin:'top left'}}><Text style={styles.header}>{header}</Text>{rows.map((_,i)=><FileRow key={i} index={i} time={time} weight={weight} names={rows}/>)}<SelectedFile time={time} weight={weight} name={selectedName} cards={cards}/>{[0,1].map(i=><PhotoPrint key={i} index={i} time={time} weight={weight} uri={prints[i]}/>)}<Animated.Text style={[styles.hint,{top:h-53},hintStyle]}>{hint}</Animated.Text></Animated.View></GestureDetector></View>;
}
const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:'#D0D0C5',overflow:'hidden'},header:{position:'absolute',left:25,top:84,fontSize:14,fontWeight:'600',color:'#11120E'},row:{position:'absolute',left:20},folderName:{position:'absolute',left:10,top:10,fontSize:13,fontWeight:'500',color:'rgba(0,0,0,.88)'},letter:{position:'absolute',top:14,fontSize:12,fontWeight:'500',color:'#D0D0C5'},selected:{position:'absolute',width:349,height:245,isolation:'isolate'},cardFan:{position:'absolute',left:0,top:0},card:{width:232,height:126,isolation:'isolate',backgroundColor:'#FAF9F2',padding:15,boxShadow:[{offsetX:0,offsetY:2,blurRadius:2,color:'rgba(0,0,0,.1)'},{offsetX:0,offsetY:12,blurRadius:16,color:'rgba(0,0,0,.16)'}]},cardTitle:{fontSize:15,fontWeight:'600',color:'#151510'},cardLine:{fontSize:10,color:'rgba(0,0,0,.6)',marginTop:7},email:{position:'absolute',left:15,bottom:15,fontSize:9,color:'rgba(0,0,0,.5)'},stamp:{position:'absolute',left:184,top:14,width:30,height:30,padding:5},stampInset:{flex:1,borderWidth:2,borderColor:'rgba(255,255,255,.4)'},frontFrame:{position:'absolute',left:0,width:349,zIndex:4,isolation:'isolate'},front:{position:'absolute',top:0,right:0,bottom:0,left:0,borderRadius:12,backgroundColor:'#C3C4B9',borderWidth:.9,borderColor:'#85867C'},print:{position:'absolute',width:90,height:110,backgroundColor:'#FCFCF5',boxShadow:'0 7px 6px rgba(0,0,0,.15)',zIndex:21},landscape:{position:'absolute',left:6,top:6,width:78,height:78},hint:{position:'absolute',left:25,fontSize:9,fontWeight:'500',letterSpacing:1.2,color:'rgba(0,0,0,.35)'},
});
