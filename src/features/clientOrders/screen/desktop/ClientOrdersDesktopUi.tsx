import type { ClientOrderProduct, ClientOrderReferenceDetails } from '@/utils/clientOrdersService';
import { Ionicons } from '@expo/vector-icons';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  CircularProgress,
  ClickAwayListener,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Popper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import React from 'react';
import { useAppSurfaceTheme } from '@/components/ui/appSurfaceTokens';
import {
  formatDateOnly,
  getCounterpartyTaxMeta,
  getPickerItemMeta,
  getPickerItemTitle,
} from '../../lib/clientOrdersUi';

export function ToolbarIconButton(props: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label?: string;
  color?: string;
  buttonSize?: number;
  iconSize?: number;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  const colors = useAppSurfaceTheme();
  const color = props.disabled ? colors.muted : props.color || colors.text;
  const filled = !!props.label && !props.disabled;
  const buttonSize = props.buttonSize || 40;
  const iconSize = props.iconSize || 20;

  return (
    <Tooltip title={props.title} arrow>
      <span>
        <IconButton
          size="small"
          aria-label={props.title}
          onClick={props.onClick}
          disabled={props.disabled}
          sx={{
            width: props.label ? 'auto' : buttonSize,
            height: buttonSize,
            minHeight: buttonSize,
            px: props.label ? 1 : undefined,
            py: 0,
            gap: props.label ? 0.55 : undefined,
            border: '1px solid transparent',
            borderRadius: '24px',
            bgcolor: filled ? color : colors.panel,
            boxSizing: 'border-box',
            transition: 'background-color 140ms ease, transform 90ms ease',
            '&:hover': { bgcolor: filled ? color : colors.soft, opacity: filled ? 0.9 : 1 },
            '&:active': { transform: 'scale(0.94)' },
          }}
        >
          {props.loading ? <CircularProgress size={15} /> : <Ionicons name={props.icon as any} size={iconSize} color={filled ? '#FFFFFF' : color} />}
          {props.label ? <Typography sx={{ fontSize: 14, fontWeight: 600, color: filled ? '#FFFFFF' : color }}>{props.label}</Typography> : null}
        </IconButton>
      </span>
    </Tooltip>
  );
}

export function DocumentPlusIcon(props: { color?: string; plusColor?: string; size?: number }) {
  const color = props.color || '#FFFFFF';
  const plusColor = props.plusColor || '#16A34A';
  const size = props.size || 18;

  return (
    <Box component="span" sx={{ position: 'relative', width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Ionicons name="document-text-outline" size={size} color={color} />
      <Box component="span" sx={{ position: 'absolute', right: -4, bottom: -3, width: 12, height: 12, borderRadius: '999px', bgcolor: 'var(--co-surface, #FFFFFF)', display: 'grid', placeItems: 'center' }}>
        <Ionicons name="add-circle" size={12} color={plusColor} />
      </Box>
    </Box>
  );
}

export function ResetAdornmentButton(props: { title: string; disabled?: boolean; onClick: () => void }) {
  return (
    <Tooltip title={props.title} arrow>
      <span>
        <IconButton
          size="small"
          disabled={props.disabled}
          aria-label={props.title}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!props.disabled) props.onClick();
          }}
          sx={{
            width: 32,
            height: 32,
            color: props.disabled ? 'var(--co-muted, #627185)' : 'var(--co-accent, #2563EB)',
            transition: 'background-color 140ms ease, color 140ms ease, transform 90ms ease',
            '&:hover': { bgcolor: props.disabled ? 'transparent' : 'var(--co-soft, #EAF2FF)', color: props.disabled ? 'var(--co-muted, #627185)' : 'var(--co-accent, #2563EB)' },
            '&:active': props.disabled ? {} : { transform: 'scale(0.92)' },
          }}
        >
          <Ionicons style={{ color: 'inherit' }} name="refresh-outline" size={14} />
        </IconButton>
      </span>
    </Tooltip>
  );
}

function toDateInputValue(value?: string | null) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatShortDate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return parsed.toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: '2-digit' });
}

export function DeliveryDateField(props: {
  value?: string | null;
  disabled?: boolean;
  onChange: (date: string | null) => void;
}) {
  const { value: propValue, disabled, onChange } = props;
  const [open, setOpen] = React.useState(false);
  const [visibleMonth, setVisibleMonth] = React.useState(() => {
    const base = propValue ? new Date(`${toDateInputValue(propValue)}T00:00:00`) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const anchorRef = React.useRef<HTMLDivElement | null>(null);
  const value = toDateInputValue(propValue);
  const { minDate, maxDate, days } = React.useMemo(() => {
    const today = new Date();
    const min = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const max = new Date(min);
    max.setMonth(max.getMonth() + 2);
    const first = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const offset = (first.getDay() + 6) % 7;
    const start = new Date(first);
    start.setDate(first.getDate() - offset);
    const monthDays = Array.from({ length: 42 }, (_, index) => {
      const next = new Date(start);
      next.setDate(start.getDate() + index);
      const year = next.getFullYear();
      const month = String(next.getMonth() + 1).padStart(2, '0');
      const day = String(next.getDate()).padStart(2, '0');
      return {
        iso: `${year}-${month}-${day}`,
        day: next.getDate(),
        inMonth: next.getMonth() === visibleMonth.getMonth(),
        disabled: next < min || next > max,
        today: next.getTime() === min.getTime(),
      };
    });
    return { minDate: min, maxDate: max, days: monthDays };
  }, [visibleMonth]);
  const visibleMonthLabel = React.useMemo(() => visibleMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }), [visibleMonth]);
  const displayValue = React.useMemo(() => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('ru-RU') : ''), [value]);
  const canPrevMonth = React.useMemo(() => {
    const prev = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1);
    return prev >= new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  }, [minDate, visibleMonth]);
  const canNextMonth = React.useMemo(() => {
    const next = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1);
    return next <= new Date(maxDate.getFullYear(), maxDate.getMonth(), 1);
  }, [maxDate, visibleMonth]);

  React.useEffect(() => {
    if (!open) return;
    const base = value ? new Date(`${value}T00:00:00`) : new Date();
    setVisibleMonth(new Date(base.getFullYear(), base.getMonth(), 1));
  }, [open, value]);

  const moveMonth = React.useCallback((delta: number) => {
    setVisibleMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  }, []);

  const selectDate = React.useCallback((date: string) => {
    onChange(date);
    setOpen(false);
  }, [onChange]);

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Box ref={anchorRef} sx={{ position: 'relative', mt: 0.35 }}>
        <Typography sx={{ position: 'absolute', top: -5, left: 10, zIndex: 1, px: 0.35, bgcolor: 'var(--co-surface, #FFFFFF)', fontSize: 12, fontWeight: 600, color: 'var(--co-muted, #627185)', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>
          Дата отгрузки
        </Typography>
        <TextField
          size="small"
          value={displayValue}
          placeholder="Выберите дату"
          disabled={disabled}
          onClick={() => !disabled && setOpen(true)}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Escape') {event.preventDefault(); setOpen(false);}
            if (!disabled && (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown')) {event.preventDefault(); setOpen(true);}
          }}
          fullWidth
          sx={{
            '& .MuiInputBase-root': { height: 40, borderRadius: '12px', fontSize: 14, fontWeight: 500 },
            '& .MuiInputBase-input': { py: 0, lineHeight: '40px' },
            '& .MuiInputBase-input.Mui-disabled': { WebkitTextFillColor: 'var(--co-muted, #627185)' },
          }}
          slotProps={{
            htmlInput: {'aria-label': 'Дата отгрузки', 'aria-expanded': open && !disabled, 'aria-haspopup': 'dialog'},
            input: {
              readOnly: true,
              endAdornment: <Ionicons name="calendar-outline" size={15} color="var(--co-muted, #627185)" />,
            }
          }}
        />
        <Popper open={open && !disabled} anchorEl={anchorRef.current} placement="bottom-start" sx={{ zIndex: 1500, width: Math.max(anchorRef.current?.clientWidth || 0, 296), maxWidth: 'calc(100vw - 24px)' }}>
          <Paper role="dialog" aria-label="Календарь отгрузки" onKeyDown={event => {if (event.key === 'Escape') setOpen(false);}} variant="outlined" sx={{ mt: 0.75, borderRadius: '16px', overflow: 'hidden', boxShadow: '0 12px 32px rgba(15, 23, 42, 0.16)', p: 1 }}>
            <Stack spacing={0.8}>
              <Stack
                direction="row"
                sx={{
                  justifyContent: "space-between",
                  alignItems: "center"
                }}>
                <IconButton aria-label="Предыдущий месяц" size="small" disabled={!canPrevMonth} onClick={() => moveMonth(-1)} sx={{ width: 32, height: 32 }}>
                  <Ionicons style={{ color: 'inherit' }} name="chevron-back-outline" size={14} />
                </IconButton>
                <Typography sx={{ fontSize: 12, fontWeight: 700, textTransform: 'capitalize' }}>{visibleMonthLabel}</Typography>
                <IconButton aria-label="Следующий месяц" size="small" disabled={!canNextMonth} onClick={() => moveMonth(1)} sx={{ width: 32, height: 32 }}>
                  <Ionicons style={{ color: 'inherit' }} name="chevron-forward-outline" size={14} />
                </IconButton>
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.25 }}>
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((label) => (
                  <Typography key={label} sx={{ fontSize: 12, color: 'var(--co-muted, #627185)', textAlign: 'center', fontWeight: 600 }}>{label}</Typography>
                ))}
                {days.map((day) => (
                  <Box
                    key={day.iso}
                    component="button"
                    type="button"
                    aria-label={new Date(`${day.iso}T00:00:00`).toLocaleDateString('ru-RU', {day: 'numeric', month: 'long', year: 'numeric'})}
                    aria-pressed={day.iso === value}
                    disabled={day.disabled}
                    onClick={() => selectDate(day.iso)}
                    sx={{
                      border: 0,
                      borderRadius: '6px',
                      height: 36,
                      background: day.iso === value ? 'var(--co-accent, #2563EB)' : day.today ? 'var(--co-soft, #EAF2FF)' : 'var(--co-surface, #FFFFFF)',
                      color: day.iso === value ? '#FFFFFF' : day.inMonth ? 'var(--co-text, #18212D)' : 'var(--co-muted, #627185)',
                      cursor: day.disabled ? 'not-allowed' : 'pointer',
                      fontSize: 14,
                      fontWeight: day.today || day.iso === value ? 700 : 500,
                      opacity: day.disabled ? 0.35 : 1,
                      transition: 'background-color 140ms ease, transform 90ms ease',
                      '&:hover': { backgroundColor: day.disabled ? undefined : day.iso === value ? 'var(--co-accent, #2563EB)' : 'var(--co-panel, #EEF2F7)' },
                      '&:active': day.disabled ? {} : { transform: 'scale(0.95)' },
                    }}
                  >
                    {day.day}
                  </Box>
                ))}
              </Box>
              <Typography sx={{ fontSize: 12, color: 'var(--co-muted, #627185)' }}>Доступно с сегодня до {formatShortDate(toDateInputValue(maxDate.toISOString()))}.</Typography>
            </Stack>
          </Paper>
        </Popper>
      </Box>
    </ClickAwayListener>
  );
}

function stringifyDetailsValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  if (value instanceof Date) return value.toLocaleString('ru-RU');
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('ru-RU');
  }
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

export function ReferenceDetailsDialog(props: {
  open: boolean;
  loading: boolean;
  error: string | null;
  details: ClientOrderReferenceDetails | null;
  fullScreen?: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={props.open} onClose={props.onClose} maxWidth="md" fullWidth fullScreen={props.fullScreen}>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack
          direction="row"
          spacing={2}
          sx={{
            justifyContent: "space-between",
            alignItems: "flex-start"
          }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 20, fontWeight: 700 }}>{props.details?.title || 'Карточка реквизита'}</Typography>
            {props.details?.subtitle ? <Typography sx={{ color: 'var(--co-muted, #627185)', fontSize: 12 }}>{props.details.subtitle}</Typography> : null}
          </Box>
          <IconButton aria-label="Закрыть реквизиты" size="small" onClick={props.onClose}>
            <Ionicons style={{ color: 'inherit' }} name="close-outline" size={18} />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {props.loading ? (
          <Stack direction="row" spacing={1} sx={{
            alignItems: "center"
          }}>
            <CircularProgress size={18} />
            <Typography sx={{ color: 'var(--co-muted, #627185)', fontSize: 13 }}>Загрузка карточки...</Typography>
          </Stack>
        ) : props.error ? (
          <Alert severity="error">{props.error}</Alert>
        ) : !props.details ? (
          <Typography sx={{ color: 'var(--co-muted, #627185)', fontSize: 13 }}>Нет данных.</Typography>
        ) : (
          <Stack spacing={1.2}>
            {props.details.sections.map((section) => (
              <Paper key={section.title} variant="outlined" sx={{ borderRadius: '10px', p: 1.2 }}>
                <Typography sx={{ fontWeight: 700, mb: 0.8 }}>{section.title}</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: {xs: '1fr', sm: '180px minmax(0, 1fr)'}, gap: 0.6 }}>
                  {section.rows.map((row) => (
                    <React.Fragment key={`${section.title}-${row.label}`}>
                      <Typography sx={{ color: 'var(--co-muted, #627185)', fontSize: 12, fontWeight: 600 }}>{row.label}</Typography>
                      <Typography sx={{ color: 'var(--co-text, #18212D)', fontSize: 14, fontWeight: 700, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{stringifyDetailsValue(row.value)}</Typography>
                    </React.Fragment>
                  ))}
                </Box>
              </Paper>
            ))}
            <Accordion disableGutters>
              <AccordionSummary expandIcon={<Ionicons style={{ color: 'inherit' }} name="chevron-down-outline" size={16} />}>
                <Typography sx={{ fontWeight: 700 }}>JSON / debug</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box component="pre" sx={{ m: 0, p: 1, bgcolor: 'var(--co-panel, #EEF2F7)', color: 'var(--co-text, #18212D)', borderRadius: '8px', maxHeight: 320, overflow: 'auto', fontSize: 11 }}>
                  {JSON.stringify(props.details.debug, null, 2)}
                </Box>
              </AccordionDetails>
            </Accordion>
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={props.onClose} sx={{ textTransform: 'none', fontWeight: 600 }}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
}
