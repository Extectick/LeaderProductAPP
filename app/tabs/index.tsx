import Navigation from '@/components/Navigation';
import React from 'react';
import ProtectedRoute from '../../components/ProtectedRoute';

export default function Tabs() {
  return (
    <ProtectedRoute>
      <Navigation />
    </ProtectedRoute>
  );
}

