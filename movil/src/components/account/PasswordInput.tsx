import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';
import { Input } from '../ui';
import { useColors } from '@/theme/theme';

/** Contraseña con el botón para verla (PasswordInput de la web): Configuración › Contraseña. */
export function PasswordInput({
  value,
  onChange,
  label,
  invalid,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const c = useColors();
  const [shown, setShown] = useState(false);
  return (
    <View style={{ justifyContent: 'center' }}>
      <Input
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        secureTextEntry={!shown}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        autoFocus={autoFocus}
        invalid={invalid}
        style={{ paddingRight: 52 }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={shown ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        onPress={() => setShown(!shown)}
        style={{ position: 'absolute', right: 4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
      >
        {shown ? <EyeOff size={20} color={c.muted} /> : <Eye size={20} color={c.muted} />}
      </Pressable>
    </View>
  );
}
