import { cn } from '../lib/utils';

export const BOUSSOULE_LOGO = '/brand/boussoule-logo.png';
export const BOUSSOULE_NAME = 'Boussoule';
export const BOUSSOULE_TAGLINE = 'Ensemble, guidons chaque élève';

const BrandLogo = ({
  className,
  iconClassName = 'h-12 w-12',
  nameClassName,
  taglineClassName,
  showTagline = false,
  light = false,
}) => (
  <div className={cn('inline-flex items-center gap-3', className)}>
    <img
      src={BOUSSOULE_LOGO}
      alt="Logo Boussoule"
      className={cn('shrink-0 object-contain', iconClassName)}
      draggable="false"
    />
    <div className="min-w-0 text-left leading-none">
      <div
        className={cn(
          'font-display text-xl font-extrabold tracking-tight',
          light ? 'text-white' : 'text-[#173A59] dark:text-white',
          nameClassName,
        )}
      >
        {BOUSSOULE_NAME}
      </div>
      {showTagline && (
        <div
          className={cn(
            'mt-1 text-xs font-semibold leading-tight',
            light ? 'text-[#CDEDE8]' : 'text-[#2A9D8F] dark:text-[#7DD3C7]',
            taglineClassName,
          )}
        >
          {BOUSSOULE_TAGLINE}
        </div>
      )}
    </div>
  </div>
);

export default BrandLogo;
