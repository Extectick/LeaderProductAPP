// app/(main)/_layout.tsx
import AppHeader from '@/components/AppHeader';
import Navigation from '@/components/Navigation/Navigation';

export default function MainLayout() {
  return (
    <>
    <AppHeader />
    <Navigation/>
  </>
);
}
