import React, {useRef, useState} from 'react';
import {Text, View} from 'react-native';
import {Button, Choice, Field, useTaskStyles} from './controls';
import {metricLabels, nextOccurrence, validateDraft, warehouseLabel} from './model';
import type {Draft, Metric} from './model';

export function dateText(value: number, timeZone: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', timeZone,
  }).format(new Date(value));
}

export function ScheduleEditor({initial, editing, now, onSave, onClose, warehouses}: {
  initial: Draft; editing: boolean; now: number; onSave: (draft: Draft) => void | Promise<void>; onClose: () => void | Promise<void>; warehouses?: Record<string,string>;
}) {
  const {c, s} = useTaskStyles();
  const [draft, setDraft] = useState<Draft>(() => ({
    time: initial.time, timeZone: initial.timeZone, metric: initial.metric, warehouse: initial.warehouse,
  }));
  const [customizing, customize] = useState(editing);
  const [error, setError] = useState('');
  const submitted = useRef(false);
  function change(patch: Partial<Draft>) {
    setDraft(value => ({...value, ...patch}));
    setError('');
  }
  const [pending,setPending] = useState(false);
  async function perform(action:()=>void | Promise<void>) {
    if (submitted.current) return;
    submitted.current = true;
    setPending(true);
    try { await action(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить изменения.'); }
    finally { submitted.current=false; setPending(false); }
  }
  function submit() {
    void perform(async()=>{
      const value={...draft,warehouse:draft.warehouse.trim() || 'all',timeZone:draft.timeZone.trim()};
      validateDraft(value);
      await onSave(value);
    });
  }
  let next = '';
  try { validateDraft(draft); next = dateText(nextOccurrence(draft, now), draft.timeZone); } catch { /* Input is being edited. */ }
  return <View style={s.card} testID="schedule-editor">
    <View style={{gap:4}}>
      <Text style={[s.label,{color:c.accentText}]}>{editing ? 'Редактирование' : 'Регламентное задание'}</Text>
      <Text accessibilityRole="header" style={s.title}>Проверка отрицательных остатков</Text>
    </View>
    {customizing ? <>
      <View style={s.row}>
        <Field label="Время каждый день" value={draft.time} onChangeText={time => change({time})} placeholder="12:00" maxLength={5}/>
        <Field label="Часовой пояс" value={draft.timeZone} onChangeText={timeZone => change({timeZone})} autoCapitalize="none" autoCorrect={false} placeholder="Asia/Novosibirsk"/>
      </View>
      <Text style={s.label}>Что проверять</Text>
      <View style={s.row}>{(Object.keys(metricLabels) as Metric[]).map(metric =>
        <Choice key={metric} label={metricLabels[metric]} selected={metric === draft.metric} onPress={() => change({metric})}/>)}</View>
      <Text style={s.label}>Где проверять</Text>
      {warehouses ? <View style={s.row}>{Object.entries(warehouses).map(([warehouse,label]) =>
        <Choice key={warehouse} label={label} selected={warehouse === draft.warehouse} onPress={() => change({warehouse})}/>)}</View>
        : <Field label="Склад в 1С" placeholder="Все склады" value={draft.warehouse==='all'?'':draft.warehouse}
            onChangeText={value => change({warehouse:value || 'all'})} maxLength={150}/>}
    </> : <View style={{gap:6}}>
      <Text style={s.body}>Ежедневно в {draft.time} · {draft.timeZone}</Text>
      <Text style={s.body}>{warehouses?.[draft.warehouse] ?? warehouseLabel(draft.warehouse)} · {metricLabels[draft.metric]}</Text>
    </View>}
    <Text style={s.caption}>Личный отчёт появится, если остаток хотя бы одной позиции ниже нуля.</Text>
    {next ? <Text style={s.label}>Следующая проверка · {next}</Text> : null}
    {error ? <Text accessibilityRole="alert" style={{color:c.danger}}>{error}</Text> : null}
    <View style={[s.row,s.divider]}>
      <Button kind="primary" label={editing ? 'Сохранить' : 'Включить задание'} icon="checkmark-outline" disabled={pending} onPress={submit}/>
      {!customizing && <Button label="Изменить" onPress={() => customize(true)}/>}
      <Button kind="quiet" label="Отмена" disabled={pending} onPress={()=>void perform(onClose)}/>
    </View>
  </View>;
}
