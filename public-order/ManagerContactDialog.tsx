import React from 'react';
import { Dialog, DialogContent, DialogTitle, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PhoneIcon from '@mui/icons-material/PhoneOutlined';
import TelegramIcon from '@mui/icons-material/Telegram';
import { useGalleryHistory } from '../src/features/clientOrders/hooks/useGalleryHistory';
// Official MAX brand asset: https://go.max.ru/brandbook
// Download: https://st.max.ru/brandbook/max-colored.zip (Max colored.png).
import maxLogo from './max-logo.png';

export type ManagerContacts = {
  name: string;
  phones: { label: string; number: string }[];
  telegramUrl: string | null;
  maxUrl: string | null;
};

export function ManagerContactDialog({ manager, open, onClose }: {
  manager: ManagerContacts | null;
  open: boolean;
  onClose: () => void;
}) {
  // Reuse the same overlay history handling as photos: Back closes the dialog.
  const close = useGalleryHistory(open, onClose);
  const hasContacts = !!(manager?.phones.length || manager?.telegramUrl || manager?.maxUrl);
  return <Dialog open={open} onClose={close} fullWidth maxWidth="xs"
    aria-labelledby="manager-contact-title" className="manager-contact-dialog">
    <DialogTitle id="manager-contact-title" sx={{ pr: 7, pb: 1, fontSize: 19, fontWeight: 600 }}>
      Связь с менеджером
      <IconButton aria-label="Закрыть контакты" onClick={close} sx={{ position: 'absolute', right: 8, top: 8, width: 44, height: 44 }}><CloseIcon /></IconButton>
    </DialogTitle>
    <DialogContent sx={{ px: 0, pb: 1 }}>
      {manager?.name ? <Typography sx={{ px: 3, mb: 1, overflowWrap: 'anywhere' }} color="text.secondary">{manager.name}</Typography> : null}
      {hasContacts ? <List disablePadding aria-label="Контакты менеджера">
        {manager?.phones.map(phone => <ListItemButton key={phone.number} component="a" href={`tel:${phone.number}`}
          aria-label={`Позвонить: ${phone.label ? `${phone.label}, ` : ''}${phone.number}`}>
          <ListItemIcon><PhoneIcon color="primary" /></ListItemIcon>
          <ListItemText primary={phone.number} secondary={phone.label || undefined} />
        </ListItemButton>)}
        {manager?.telegramUrl ? <ListItemButton component="a" href={manager.telegramUrl} target="_blank" rel="noreferrer noopener" aria-label="Написать в Telegram">
          <ListItemIcon><TelegramIcon sx={{ color: '#229ed9' }} /></ListItemIcon><ListItemText primary="Telegram" />
        </ListItemButton> : null}
        {manager?.maxUrl ? <ListItemButton component="a" href={manager.maxUrl} target="_blank" rel="noreferrer noopener" aria-label="Написать в MAX">
          <ListItemIcon><img src={maxLogo} alt="" width={24} height={24} /></ListItemIcon><ListItemText primary="MAX" />
        </ListItemButton> : null}
      </List> : <Typography sx={{ px: 3, py: 1 }} color="text.secondary">Контакты менеджера пока не указаны.</Typography>}
    </DialogContent>
  </Dialog>;
}
