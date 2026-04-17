import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RolePicker } from './RolePicker';

describe('RolePicker', () => {
  it('calls onChange with selected role', () => {
    const onChange = vi.fn();
    render(<RolePicker value="SELLER" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Дизайнер' }));
    expect(onChange).toHaveBeenCalledWith('DESIGNER');
  });
});
