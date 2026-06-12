import ClientOrdersMobileScreen from '../../ClientOrdersMobileScreen';

type Props = {
  registerBackOverlayHandler?: (handler: (() => boolean) | null) => void;
};

export default function ClientOrdersMobileLayout(props: Props) {
  return <ClientOrdersMobileScreen {...props} />;
}
