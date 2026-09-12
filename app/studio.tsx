'use client';
import {useState} from 'react';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Button} from '@/components/ui/button';
export type Topic={module:string;id:string;parent:string;name:string;level:string};
export function Choice({label,value,items,onChange}:{label:string;value:string;items:{id:string;name:string}[];onChange:(v:string)=>void}){return <div className="field"><label>{label}</label><Select value={value} onValueChange={v=>v&&onChange(v)}><SelectTrigger aria-label={label} className="choice"><SelectValue>{items.find(x=>x.id===value)?.name||'Select…'}</SelectValue></SelectTrigger><SelectContent>{items.map(x=><SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></div>}

