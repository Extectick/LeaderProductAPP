import DateTimeInput from '@/components/ui/DateTimeInput';
import { useHeaderContentTopInset } from '@/components/Navigation/useHeaderContentTopInset';
import { useThemeColor } from '@/hooks/useThemeColor';
import { computeLineTotal, formatDateTime, formatMoney } from '@/src/features/clientOrders/clientOrdersShared';
import { useClientOrdersWorkspace } from '@/src/features/clientOrders/useClientOrdersWorkspace';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';

function statusTone(status: string) {
  switch (status) {
    case 'CANCELLED':
      return 'error';
    case 'SENT_TO_1C':
    case 'SYNCED':
      return 'success';
    case 'QUEUED':
      return 'warning';
    default:
      return 'default';
  }
}

function SectionShell(props: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Paper variant="outlined" sx={{ borderRadius: '24px', borderColor: '#D9E3F0', p: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction="row" spacing={1.5} justifyContent="space-between" alignItems="center">
          <Box>
            <Typography sx={{ fontSize: 22, fontWeight: 900, color: '#0F172A' }}>{props.title}</Typography>
            <Typography sx={{ color: '#64748B', fontSize: 13 }}>{props.subtitle}</Typography>
          </Box>
          {props.action}
        </Stack>
        {props.children}
      </Stack>
    </Paper>
  );
}

export default function ClientOrdersWebScreen() {
  const workspace = useClientOrdersWorkspace();
  const topInset = useHeaderContentTopInset({ hasSubtitle: true });
  const background = useThemeColor({}, 'background');
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const [productsOpen, setProductsOpen] = React.useState(false);

  const title = workspace.draftMode
    ? 'Новый заказ клиента'
    : workspace.selectedOrder?.number1c
      ? `Заказ 1С ${workspace.selectedOrder.number1c}`
      : `Черновик ${workspace.selectedOrder?.guid.slice(0, 8) || ''}`;
  const subtitle = workspace.draftMode
    ? 'Черновик живет в API до создания документа в 1С'
    : `${workspace.statusLabels[workspace.selectedOrder?.status || ''] || workspace.selectedOrder?.status || '—'} • ${
        workspace.syncLabels[workspace.selectedOrder?.syncState || ''] || workspace.selectedOrder?.syncState || '—'
      }`;

  return (
    <Box
      sx={{
        backgroundColor: background,
        minHeight: '100%',
        px: 2,
        pb: 2,
        pt: `${topInset + 10}px`,
      }}
    >
      <Stack direction="row" spacing={2} sx={{ height: `calc(100vh - ${topInset + 26}px)` }}>
        <Paper
          elevation={0}
          sx={{
            width: 380,
            borderRadius: '28px',
            border: '1px solid #D7E3F1',
            background: 'linear-gradient(180deg, #FBFDFF 0%, #F3F7FC 100%)',
            p: 2,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Stack spacing={2}>
            <Box>
              <Typography sx={{ fontSize: 26, fontWeight: 900, color: '#0F172A' }}>Заказы клиентов</Typography>
              <Typography sx={{ mt: 0.5, color: '#64748B', fontSize: 13 }}>
                Фильтры, черновики и быстрый доступ к заказам
              </Typography>
            </Box>

            <Stack spacing={1.25}>
              <TextField
                size="small"
                label="Поиск"
                value={workspace.filters.search}
                onChange={(event) => workspace.setFilters((prev) => ({ ...prev, search: event.target.value }))}
                placeholder="Номер, контрагент, комментарий"
              />
              <Stack direction="row" spacing={1.25}>
                <TextField
                  select
                  size="small"
                  label="Статус"
                  value={workspace.filters.status}
                  onChange={(event) => workspace.setFilters((prev) => ({ ...prev, status: event.target.value }))}
                  sx={{ flex: 1 }}
                >
                  <MenuItem value="">Все статусы</MenuItem>
                  {Object.entries(workspace.statusLabels).map(([value, label]) => (
                    <MenuItem key={value} value={value}>
                      {label}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  size="small"
                  label="Контрагент"
                  value={workspace.filters.counterpartyGuid}
                  onChange={(event) =>
                    workspace.setFilters((prev) => ({ ...prev, counterpartyGuid: event.target.value }))
                  }
                  sx={{ flex: 1.2 }}
                >
                  <MenuItem value="">Все</MenuItem>
                  {workspace.allCounterparties.map((item) => (
                    <MenuItem key={item.guid} value={item.guid}>
                      {item.name}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>
              <Stack direction="row" spacing={1.25}>
                <Button variant="contained" onClick={() => void workspace.refreshAll()} sx={{ flex: 1, textTransform: 'none', fontWeight: 800 }}>
                  Обновить
                </Button>
                <Button variant="outlined" onClick={workspace.clearFilters} sx={{ flex: 1, textTransform: 'none', fontWeight: 800 }}>
                  Сбросить
                </Button>
              </Stack>
              <Button
                variant="contained"
                color="secondary"
                onClick={() => void workspace.createNewOrder()}
                sx={{ textTransform: 'none', borderRadius: '16px', fontWeight: 900, py: 1.2, bgcolor: '#0F172A' }}
              >
                Новый заказ
              </Button>
            </Stack>

            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Chip label={`Всего ${workspace.statusCounts.all}`} sx={{ fontWeight: 800 }} />
              <Chip label={`Черновики ${workspace.statusCounts.draft}`} sx={{ fontWeight: 800 }} />
              <Chip label={`В очереди ${workspace.statusCounts.queued}`} sx={{ fontWeight: 800 }} />
              <Chip label={`Отправлены ${workspace.statusCounts.sent}`} sx={{ fontWeight: 800 }} />
            </Stack>
          </Stack>

          <Divider sx={{ my: 2 }} />

          <Box sx={{ flex: 1, overflow: 'auto', pr: 0.75 }}>
            <Stack spacing={1.25}>
              {workspace.loadingOrders ? (
                <Stack direction="row" spacing={1} alignItems="center" sx={{ color: '#64748B' }}>
                  <CircularProgress size={16} />
                  <Typography sx={{ fontSize: 13 }}>Загружаю заказы...</Typography>
                </Stack>
              ) : null}
              {!workspace.orders.length && !workspace.loadingOrders ? (
                <Alert severity="info" sx={{ borderRadius: '16px' }}>
                  Заказы по текущему фильтру не найдены.
                </Alert>
              ) : null}
              {workspace.orders.map((order) => {
                const active = workspace.selectedGuid === order.guid;
                return (
                  <Card
                    key={order.guid}
                    variant="outlined"
                    onClick={() => void workspace.selectOrder(order.guid)}
                    sx={{
                      cursor: 'pointer',
                      borderRadius: '20px',
                      borderColor: active ? '#2563EB' : '#D9E3F0',
                      background: active ? 'linear-gradient(180deg, #EFF6FF 0%, #FFFFFF 100%)' : '#FFFFFF',
                      boxShadow: active ? '0 12px 24px rgba(37,99,235,0.12)' : 'none',
                    }}
                  >
                    <CardContent sx={{ p: 1.8, '&:last-child': { pb: 1.8 } }}>
                      <Stack spacing={0.75}>
                        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                          <Typography sx={{ fontWeight: 900, color: '#0F172A' }}>
                            {order.number1c ? `Заказ ${order.number1c}` : `Черновик ${order.guid.slice(0, 8)}`}
                          </Typography>
                          <Chip
                            size="small"
                            color={statusTone(order.status) as any}
                            label={workspace.statusLabels[order.status] || order.status}
                            sx={{ fontWeight: 800 }}
                          />
                        </Stack>
                        <Typography sx={{ color: '#475569', fontSize: 13, fontWeight: 700 }}>
                          {order.counterparty?.name || 'Контрагент не выбран'}
                        </Typography>
                        <Typography sx={{ color: '#64748B', fontSize: 12 }}>
                          {workspace.syncLabels[order.syncState] || order.syncState} • rev {order.revision}
                        </Typography>
                        <Typography sx={{ color: '#94A3B8', fontSize: 12 }}>
                          {formatDateTime(order.updatedAt || order.queuedAt || order.sentTo1cAt)}
                        </Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}
            </Stack>
          </Box>
        </Paper>

        <Paper
          elevation={0}
          sx={{
            flex: 1,
            borderRadius: '28px',
            border: '1px solid #D7E3F1',
            background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FBFF 100%)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box
            sx={{
              position: 'sticky',
              top: 0,
              zIndex: 2,
              px: 2.5,
              py: 2,
              borderBottom: '1px solid #E2E8F0',
              background: 'rgba(255,255,255,0.92)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <Stack spacing={1.25}>
              <Stack direction="row" spacing={1.5} justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <Typography sx={{ fontSize: 28, fontWeight: 900, color: '#0F172A' }}>{title}</Typography>
                  <Typography sx={{ color: '#64748B', fontSize: 13 }}>{subtitle}</Typography>
                </Box>
                <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent="flex-end">
                  <Chip
                    label={workspace.autosaveLabel}
                    color={workspace.autosaveState === 'error' ? 'error' : 'default'}
                    sx={{ fontWeight: 800 }}
                  />
                  {!workspace.draftMode ? (
                    <>
                      <Chip label={workspace.statusLabels[workspace.selectedOrder?.status || ''] || workspace.selectedOrder?.status || '—'} sx={{ fontWeight: 800 }} />
                      <Chip label={workspace.syncLabels[workspace.selectedOrder?.syncState || ''] || workspace.selectedOrder?.syncState || '—'} sx={{ fontWeight: 800 }} />
                    </>
                  ) : null}
                </Stack>
              </Stack>

              <Stack direction="row" spacing={1.25} useFlexGap flexWrap="wrap">
                <Button variant="outlined" onClick={() => void workspace.refreshAll()} sx={{ textTransform: 'none', fontWeight: 800 }}>
                  Обновить
                </Button>
                <Button variant="outlined" onClick={() => setInspectorOpen(true)} sx={{ textTransform: 'none', fontWeight: 800 }}>
                  Инспектор
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  disabled={workspace.readOnly || workspace.cancelling}
                  onClick={workspace.cancelOrder}
                  sx={{ textTransform: 'none', fontWeight: 800 }}
                >
                  {workspace.cancelling ? 'Отмена...' : 'Отменить'}
                </Button>
                <Button
                  variant="contained"
                  disabled={workspace.readOnly || workspace.saving || !workspace.validation.canSave}
                  onClick={() => void workspace.saveDraft({ reason: 'manual' })}
                  sx={{ textTransform: 'none', fontWeight: 800 }}
                >
                  {workspace.saving ? 'Сохраняю...' : 'Сохранить'}
                </Button>
                <Button
                  variant="contained"
                  color="secondary"
                  disabled={workspace.readOnly || workspace.submitting || !workspace.validation.canSave}
                  onClick={() => void workspace.submitOrder()}
                  sx={{ textTransform: 'none', fontWeight: 800 }}
                >
                  {workspace.submitting ? 'Отправляю...' : 'Отправить в 1С'}
                </Button>
              </Stack>
            </Stack>
          </Box>

          <Box sx={{ flex: 1, overflow: 'auto', px: 2.5, py: 2.5 }}>
            <Stack spacing={2.25}>
              {workspace.error ? <Alert severity="error" sx={{ borderRadius: '16px' }}>{workspace.error}</Alert> : null}
              {workspace.autosaveError ? <Alert severity="warning" sx={{ borderRadius: '16px' }}>{workspace.autosaveError}</Alert> : null}
              {workspace.loadingDetail ? (
                <Stack direction="row" spacing={1} alignItems="center" sx={{ color: '#64748B' }}>
                  <CircularProgress size={18} />
                  <Typography>Загружаю карточку заказа...</Typography>
                </Stack>
              ) : null}

              <SectionShell title="Реквизиты" subtitle="Быстрое заполнение документа и зависимых справочников">
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, minmax(180px, 1fr))',
                    gap: 1.5,
                  }}
                >
                  <TextField
                    select
                    size="small"
                    label="Контрагент"
                    value={workspace.draft.counterpartyGuid}
                    onChange={(event) => workspace.setCounterparty(event.target.value)}
                    disabled={workspace.readOnly}
                  >
                    <MenuItem value="">Выберите контрагента</MenuItem>
                    {workspace.refs.counterparties.map((item) => (
                      <MenuItem key={item.guid} value={item.guid}>
                        {item.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label="Соглашение"
                    value={workspace.draft.agreementGuid}
                    onChange={(event) => workspace.setAgreement(event.target.value)}
                    disabled={workspace.readOnly}
                  >
                    <MenuItem value="">Выберите соглашение</MenuItem>
                    {workspace.refs.agreements.map((item) => (
                      <MenuItem key={item.guid} value={item.guid}>
                        {item.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label="Договор"
                    value={workspace.draft.contractGuid}
                    onChange={(event) => workspace.patchDraft({ contractGuid: event.target.value })}
                    disabled={workspace.readOnly}
                  >
                    <MenuItem value="">Выберите договор</MenuItem>
                    {workspace.refs.contracts.map((item) => (
                      <MenuItem key={item.guid} value={item.guid}>
                        {item.number}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label="Склад"
                    value={workspace.draft.warehouseGuid}
                    onChange={(event) => workspace.patchDraft({ warehouseGuid: event.target.value })}
                    disabled={workspace.readOnly}
                  >
                    <MenuItem value="">Выберите склад</MenuItem>
                    {workspace.refs.warehouses.map((item) => (
                      <MenuItem key={item.guid} value={item.guid}>
                        {item.name}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    select
                    size="small"
                    label="Адрес доставки"
                    value={workspace.draft.deliveryAddressGuid}
                    onChange={(event) => workspace.patchDraft({ deliveryAddressGuid: event.target.value })}
                    disabled={workspace.readOnly}
                  >
                    <MenuItem value="">Выберите адрес</MenuItem>
                    {workspace.refs.deliveryAddresses
                      .filter((item) => item.guid)
                      .map((item) => (
                        <MenuItem key={item.guid} value={item.guid}>
                          {item.fullAddress}
                        </MenuItem>
                      ))}
                  </TextField>
                  <Box sx={{ minWidth: 220 }}>
                    <DateTimeInput
                      value={workspace.draft.deliveryDate || undefined}
                      onChange={(iso) => workspace.patchDraft({ deliveryDate: iso })}
                      allowClear
                      onClear={() => workspace.patchDraft({ deliveryDate: null })}
                      disabled={workspace.readOnly}
                    />
                  </Box>
                  <TextField
                    size="small"
                    label="Общая скидка, %"
                    value={workspace.draft.generalDiscountPercent}
                    onChange={(event) => workspace.patchDraft({ generalDiscountPercent: event.target.value })}
                    disabled={workspace.readOnly}
                  />
                  <TextField
                    size="small"
                    label="Валюта"
                    value={workspace.draft.currency}
                    onChange={(event) => workspace.patchDraft({ currency: event.target.value })}
                    disabled={workspace.readOnly}
                  />
                </Box>
              </SectionShell>

              <SectionShell title="Комментарий" subtitle="Короткие заметки менеджера для документа">
                <TextField
                  fullWidth
                  multiline
                  minRows={4}
                  label="Комментарий менеджера"
                  value={workspace.draft.comment}
                  onChange={(event) => workspace.patchDraft({ comment: event.target.value })}
                  disabled={workspace.readOnly}
                />
              </SectionShell>

              <SectionShell
                title="Строки заказа"
                subtitle={`Сумма по строкам: ${formatMoney(workspace.localTotal, workspace.draft.currency || workspace.selectedOrder?.currency)}`}
                action={
                  <Button
                    variant="contained"
                    onClick={() => setProductsOpen(true)}
                    disabled={workspace.readOnly}
                    sx={{ textTransform: 'none', fontWeight: 800 }}
                  >
                    Добавить товары
                  </Button>
                }
              >
                <Stack spacing={1.25}>
                  {!workspace.draft.items.length ? (
                    <Alert severity="info" sx={{ borderRadius: '16px' }}>
                      Добавьте товары через отдельный подбор.
                    </Alert>
                  ) : null}
                  {workspace.draft.items.map((item) => {
                    const messages = workspace.validation.itemMessages[item.key] || [];
                    return (
                      <Paper key={item.key} variant="outlined" sx={{ borderRadius: '20px', borderColor: '#DCE6F2', p: 1.5 }}>
                        <Stack spacing={1.25}>
                          <Stack direction="row" spacing={1.5} justifyContent="space-between" alignItems="flex-start">
                            <Box>
                              <Typography sx={{ fontWeight: 900, color: '#0F172A' }}>{item.productName}</Typography>
                              <Typography sx={{ fontSize: 12, color: '#64748B' }}>
                                {item.productCode || 'Без кода'} • база {formatMoney(item.basePrice, item.currency || workspace.draft.currency)}
                              </Typography>
                            </Box>
                            <Stack direction="row" spacing={1}>
                              <Button
                                variant="outlined"
                                size="small"
                                disabled={workspace.readOnly}
                                onClick={() => workspace.setItemPatch(item.key, { manualPrice: '' })}
                                sx={{ textTransform: 'none' }}
                              >
                                Сбросить цену
                              </Button>
                              <Button
                                variant="outlined"
                                color="error"
                                size="small"
                                disabled={workspace.readOnly}
                                onClick={() => workspace.removeItem(item.key)}
                                sx={{ textTransform: 'none' }}
                              >
                                Удалить
                              </Button>
                            </Stack>
                          </Stack>
                          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr 1fr auto', gap: 1.25 }}>
                            <TextField
                              size="small"
                              label="Количество"
                              value={item.quantity}
                              onChange={(event) => workspace.setItemPatch(item.key, { quantity: event.target.value })}
                              disabled={workspace.readOnly}
                            />
                            <TextField
                              select
                              size="small"
                              label="Упаковка"
                              value={item.packageGuid || ''}
                              onChange={(event) => workspace.setItemPatch(item.key, { packageGuid: event.target.value })}
                              disabled={workspace.readOnly}
                            >
                              {item.packages.map((pack) => (
                                <MenuItem key={pack.guid} value={pack.guid}>
                                  {pack.name}
                                </MenuItem>
                              ))}
                            </TextField>
                            <TextField
                              size="small"
                              label="Ручная цена"
                              placeholder="Авто"
                              value={item.manualPrice}
                              onChange={(event) => workspace.setItemPatch(item.key, { manualPrice: event.target.value })}
                              disabled={workspace.readOnly}
                            />
                            <TextField
                              size="small"
                              label="Скидка %"
                              placeholder="0"
                              value={item.discountPercent}
                              onChange={(event) => workspace.setItemPatch(item.key, { discountPercent: event.target.value })}
                              disabled={workspace.readOnly}
                            />
                            <Box sx={{ minWidth: 180, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                              <Typography sx={{ fontWeight: 900, color: '#0F172A' }}>
                                {formatMoney(computeLineTotal(item, workspace.draft.generalDiscountPercent), item.currency || workspace.draft.currency)}
                              </Typography>
                              <Typography sx={{ fontSize: 12, color: '#64748B' }}>{item.priceSource || 'Источник цены не определен'}</Typography>
                            </Box>
                          </Box>
                          {messages.length ? (
                            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                              {messages.map((message) => (
                                <Chip key={message} color="error" label={message} sx={{ fontWeight: 700 }} />
                              ))}
                            </Stack>
                          ) : null}
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              </SectionShell>

              <SectionShell
                title="Добавить товары"
                subtitle="Подбор товаров открыт отдельно, чтобы форма заказа оставалась чистой"
                action={
                  <Button variant="outlined" onClick={() => setProductsOpen(true)} disabled={workspace.readOnly} sx={{ textTransform: 'none', fontWeight: 800 }}>
                    Открыть подбор
                  </Button>
                }
              >
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip label={`Строк: ${workspace.draft.items.length}`} sx={{ fontWeight: 800 }} />
                  {workspace.loadingRefs ? <Typography sx={{ color: '#64748B', fontSize: 13 }}>Обновляю справочники...</Typography> : null}
                  {!workspace.draft.counterpartyGuid ? (
                    <Typography sx={{ color: '#B45309', fontSize: 13, fontWeight: 700 }}>
                      Для подбора сначала выберите контрагента.
                    </Typography>
                  ) : null}
                </Stack>
              </SectionShell>
            </Stack>
          </Box>
        </Paper>
      </Stack>

      <Drawer anchor="right" open={productsOpen} onClose={() => setProductsOpen(false)}>
        <Box sx={{ width: 420, p: 2.25 }}>
          <Stack spacing={1.5}>
            <Typography sx={{ fontSize: 24, fontWeight: 900 }}>Подбор товаров</Typography>
            <Typography sx={{ color: '#64748B', fontSize: 13 }}>
              Ищите по названию, коду или артикулу и добавляйте строки без выхода из документа.
            </Typography>
            <TextField
              size="small"
              label="Поиск товара"
              value={workspace.productSearch}
              onChange={(event) => workspace.setProductSearch(event.target.value)}
              disabled={workspace.readOnly || !workspace.draft.counterpartyGuid}
            />
            <Button
              variant="contained"
              onClick={() => void workspace.loadProducts()}
              disabled={workspace.loadingProducts || workspace.readOnly || !workspace.draft.counterpartyGuid}
              sx={{ textTransform: 'none', fontWeight: 800 }}
            >
              {workspace.loadingProducts ? 'Ищу...' : 'Найти'}
            </Button>
            <Divider />
            <Stack spacing={1.25}>
              {!workspace.products.length && !workspace.loadingProducts ? (
                <Alert severity="info" sx={{ borderRadius: '16px' }}>
                  Выполните поиск, чтобы увидеть доступные товары.
                </Alert>
              ) : null}
              {workspace.products.map((product) => (
                <Card key={product.guid} variant="outlined" sx={{ borderRadius: '18px' }}>
                  <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                    <Stack spacing={1}>
                      <Box>
                        <Typography sx={{ fontWeight: 900 }}>{product.name}</Typography>
                        <Typography sx={{ color: '#64748B', fontSize: 12 }}>
                          {product.code || 'Без кода'} • {formatMoney(product.basePrice, product.currency)}
                        </Typography>
                      </Box>
                      {product.priceError ? <Alert severity="warning">{product.priceError}</Alert> : null}
                      <Button
                        variant="contained"
                        disabled={workspace.readOnly || product.basePrice == null}
                        onClick={() => workspace.addProduct(product)}
                        sx={{ textTransform: 'none', fontWeight: 800 }}
                      >
                        Добавить в заказ
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              ))}
            </Stack>
          </Stack>
        </Box>
      </Drawer>

      <Drawer anchor="right" open={inspectorOpen} onClose={() => setInspectorOpen(false)}>
        <Box sx={{ width: 420, p: 2.25 }}>
          <Stack spacing={1.5}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Box>
                <Typography sx={{ fontSize: 24, fontWeight: 900 }}>Инспектор заказа</Typography>
                <Typography sx={{ color: '#64748B', fontSize: 13 }}>
                  Статусы 1С, история и технические детали вне основного редактора
                </Typography>
              </Box>
              <IconButton onClick={() => setInspectorOpen(false)}>
                <Ionicons name="close" size={20} color="#0F172A" />
              </IconButton>
            </Stack>

            <Paper variant="outlined" sx={{ borderRadius: '18px', p: 1.75 }}>
              <Stack spacing={0.75}>
                <Typography sx={{ fontWeight: 900 }}>Статус и 1С</Typography>
                <Typography sx={{ color: '#64748B', fontSize: 13 }}>Revision: {workspace.draft.revision || '—'}</Typography>
                <Typography sx={{ color: '#64748B', fontSize: 13 }}>
                  Sync state: {workspace.syncLabels[workspace.selectedOrder?.syncState || ''] || workspace.selectedOrder?.syncState || '—'}
                </Typography>
                <Typography sx={{ color: '#64748B', fontSize: 13 }}>
                  Статус: {workspace.statusLabels[workspace.selectedOrder?.status || ''] || workspace.selectedOrder?.status || '—'}
                </Typography>
                <Typography sx={{ color: '#64748B', fontSize: 13 }}>
                  Организация: {workspace.selectedOrder?.organization?.name || 'Определит 1С'}
                </Typography>
                <Typography sx={{ color: '#64748B', fontSize: 13 }}>
                  Документ 1С:{' '}
                  {workspace.selectedOrder?.number1c
                    ? `${workspace.selectedOrder.number1c} от ${formatDateTime(workspace.selectedOrder.date1c)}`
                    : 'Еще не создан'}
                </Typography>
                <Typography sx={{ color: '#64748B', fontSize: 13 }}>
                  Проведен: {workspace.selectedOrder?.isPostedIn1c ? 'Да' : 'Нет'}
                </Typography>
                {workspace.selectedOrder?.last1cError ? <Alert severity="error">{workspace.selectedOrder.last1cError}</Alert> : null}
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ borderRadius: '18px', p: 1.75 }}>
              <Stack spacing={1}>
                <Typography sx={{ fontWeight: 900 }}>История событий</Typography>
                {!workspace.selectedOrder?.events.length ? (
                  <Typography sx={{ color: '#64748B', fontSize: 13 }}>Событий пока нет.</Typography>
                ) : (
                  workspace.selectedOrder.events.map((event) => (
                    <Box key={event.id} sx={{ borderRadius: '14px', bgcolor: '#F8FAFC', px: 1.4, py: 1.2 }}>
                      <Typography sx={{ fontWeight: 800 }}>{event.eventType} • rev {event.revision}</Typography>
                      <Typography sx={{ fontSize: 12, color: '#64748B' }}>
                        {event.source} • {formatDateTime(event.createdAt)}
                      </Typography>
                      {event.note ? <Typography sx={{ fontSize: 12, color: '#475569' }}>{event.note}</Typography> : null}
                    </Box>
                  ))
                )}
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ borderRadius: '18px', p: 1.75 }}>
              <Stack spacing={1}>
                <Typography sx={{ fontWeight: 900 }}>Последний snapshot из 1С</Typography>
                {workspace.selectedOrder?.last1cSnapshot ? (
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      p: 1.5,
                      borderRadius: '14px',
                      bgcolor: '#0F172A',
                      color: '#E2E8F0',
                      overflow: 'auto',
                      fontSize: 12,
                    }}
                  >
                    {JSON.stringify(workspace.selectedOrder.last1cSnapshot, null, 2)}
                  </Box>
                ) : (
                  <Typography sx={{ color: '#64748B', fontSize: 13 }}>Снимок из 1С еще не получен.</Typography>
                )}
              </Stack>
            </Paper>
          </Stack>
        </Box>
      </Drawer>
    </Box>
  );
}
