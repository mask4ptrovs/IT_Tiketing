import './globals.css';
import { Providers } from '../components/layout/Providers';

export const metadata = {
  title: 'IT Ticketing System',
  description: 'Sistem Ticketing IT & Pelaporan Internal Perusahaan',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
