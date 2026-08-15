import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text } from 'react-native';
import type { CounterpartyAddress, CounterpartyCardBootstrap, CounterpartyContact } from '../../model/counterpartyCard.types';
import { valueOrDash } from '../../model/counterpartyCard.formatters';
import { InfoRow, SectionCard, SectionUnavailable } from '../CounterpartyCardPrimitives';

function contactCode(contact: CounterpartyContact) {
  return [contact.kindCode, contact.kind, contact.addressType, contact.label].filter(Boolean).join(' ').toUpperCase();
}

function isAddress(contact: CounterpartyContact) {
  return Boolean(contact.addressType) || /ADDRESS|АДРЕС|ЮРИД|ФАКТИЧ|ДОСТАВ/.test(contactCode(contact));
}

function isPhone(contact: CounterpartyContact) {
  return /PHONE|TEL|ТЕЛЕФОН|МОБИЛ/.test(contactCode(contact));
}

function addressLabel(code: string, fallback?: string | null) {
  if (/DELIVERY|ДОСТАВ/.test(code)) return 'Адрес доставки';
  if (/ACTUAL|FACT|ФАКТИЧ/.test(code)) return 'Фактический адрес';
  if (/LEGAL|REGISTER|ЮРИД/.test(code)) return 'Юридический адрес';
  if (/POST|ПОЧТОВ/.test(code)) return 'Почтовый адрес';
  return fallback || 'Адрес';
}

function phoneLabel(contact: CounterpartyContact) {
  const code = contactCode(contact);
  if (/MOBILE|МОБИЛ/.test(code)) return 'Мобильный телефон';
  if (contact.isPrimary) return 'Основной телефон';
  return contact.label || 'Телефон';
}

function addressRows(data: CounterpartyCardBootstrap) {
  const explicit = (data.addresses || []).map((address: CounterpartyAddress) => ({
    label: addressLabel([address.kind, address.label].filter(Boolean).join(' ').toUpperCase(), address.label),
    value: address.value,
  }));
  const fromContacts = data.contacts.filter(isAddress).map((contact) => ({
    label: addressLabel(contactCode(contact), contact.label),
    value: contact.value,
  }));
  return [...explicit, ...fromContacts].filter((row, index, rows) => rows.findIndex((item) => item.label === row.label && item.value === row.value) === index);
}

export function CounterpartyProfileTab({ data, refreshing, onRefresh, onRetry }: { data: CounterpartyCardBootstrap; refreshing: boolean; onRefresh: () => void; onRetry: () => void }) {
  const { identity, context, commercialTerms } = data;
  const addresses = addressRows(data);
  const phones = data.contacts.filter(isPhone);
  const otherContacts = data.contacts.filter((contact) => !isAddress(contact) && !isPhone(contact));
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <SectionCard title="Реквизиты" icon="card-account-details-outline">
        <InfoRow label="Полное наименование" value={identity.fullName || identity.name} />
        <InfoRow label="ИНН" value={valueOrDash(identity.inn)} />
        <InfoRow label="КПП" value={valueOrDash(identity.kpp)} />
        <InfoRow label="Юридический тип" value={valueOrDash(identity.legalType)} />
        <InfoRow label="Партнёр" value={valueOrDash(identity.partnerName)} />
        <InfoRow label="Состояние" value={identity.isActive === null ? '—' : identity.isActive ? 'Действует' : 'Не действует'} danger={identity.isActive === false} />
      </SectionCard>
      <SectionCard title="Ответственные" icon="account-tie-outline">
        <InfoRow label="Основной менеджер" value={valueOrDash(context.managerName)} />
        <InfoRow label="Регион" value={valueOrDash(context.regionName)} />
        <InfoRow label="Зона" value={valueOrDash(context.zoneName)} />
      </SectionCard>
      {data.availability.commercialTerms === 'available' && commercialTerms ? (
        <SectionCard title="Коммерческие условия" icon="file-sign">
          <InfoRow label="Соглашение" value={valueOrDash(commercialTerms.agreementName)} />
          <InfoRow label="Договор" value={valueOrDash(commercialTerms.contractName)} />
          <InfoRow label="Вид цены" value={valueOrDash(commercialTerms.priceTypeName)} />
          <InfoRow label="Форма оплаты" value={valueOrDash(commercialTerms.paymentForm)} />
          <InfoRow label="Условия оплаты" value={valueOrDash(commercialTerms.paymentTerms)} />
          <InfoRow label="Способ доставки" value={valueOrDash(commercialTerms.deliveryMethod)} />
          <InfoRow label="Условия доставки" value={valueOrDash(commercialTerms.deliveryTerms)} />
        </SectionCard>
      ) : <SectionUnavailable forbidden={data.availability.commercialTerms === 'forbidden'} onRetry={data.availability.commercialTerms === 'unavailable' ? onRetry : undefined} />}
      {data.availability.contacts === 'available' ? (
        <>
          <SectionCard title="Адреса" icon="map-marker-outline">
            {addresses.length ? addresses.map((address, index) => <InfoRow key={`${address.label}:${address.value}:${index}`} label={address.label} value={address.value} />) : <Text style={styles.empty}>Адреса не заполнены</Text>}
          </SectionCard>
          <SectionCard title="Телефоны и контакты" icon="contacts-outline">
            {phones.map((contact, index) => <InfoRow key={`phone:${contact.value}:${index}`} label={phoneLabel(contact)} value={contact.value} />)}
            {otherContacts.map((contact, index) => <InfoRow key={`${contact.kind}:${contact.value}:${index}`} label={contact.label || contact.kind || 'Контакт'} value={contact.value} />)}
            {!phones.length && !otherContacts.length ? <Text style={styles.empty}>Контактные данные не заполнены</Text> : null}
          </SectionCard>
        </>
      ) : <SectionUnavailable forbidden={data.availability.contacts === 'forbidden'} onRetry={data.availability.contacts === 'unavailable' ? onRetry : undefined} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ scroll: { flex: 1, backgroundColor: '#FFFFFF' }, content: { flexGrow: 1, backgroundColor: '#FFFFFF', paddingBottom: 20, gap: 1 }, empty: { color: '#64748B', fontSize: 13, fontWeight: '600', textAlign: 'center', paddingVertical: 12 } });
