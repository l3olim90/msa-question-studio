'use client';
import { useId } from 'react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Maths } from './maths';
export type Topic = {
  module: string;
  id: string;
  parent: string;
  name: string;
  level: string;
};
export function Choice({
  label,
  value,
  items,
  onChange,
  disabled = false,
  name,
  required,
}: {
  label: string;
  value: string;
  items: { id: string; name: string }[];
  onChange: (v: string) => void;
  disabled?: boolean;
  name?: string;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div className="field math-choice">
      <label htmlFor={id}>
        <Maths inline text={label} />
      </label>
      <Select
        value={value}
        disabled={disabled}
        name={name}
        required={required}
        onValueChange={(v) => v !== null && onChange(v)}
      >
        <SelectTrigger id={id} className="choice">
          <SelectValue>
            <Maths
              inline
              text={items.find((x) => x.id === value)?.name || 'Select…'}
            />
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="math-choice-options">
          {items.map((x) => (
            <SelectItem key={x.id} value={x.id} label={x.name}>
              <Maths inline text={x.name} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
