import React, { useState, useEffect, useRef } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
  NativeModules,
  Platform,
  Linking
} from 'react-native';
import io from 'socket.io-client';
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
} from 'react-native-webrtc';

// Módulo Nativo que criamos para Acessibilidade
const { RemoteControl } = NativeModules;

// Como estamos rodando local por enquanto, usamos o IP local da máquina
// Substitua pelo IP da sua máquina na rede ou pelo domínio final
const SERVER_URL = 'http://10.0.2.2:3000'; // 10.0.2.2 aponta para o localhost do PC no emulador

const App = () => {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('Pronto para conectar');
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const streamRef = useRef(null);

  const codeRef = useRef('');

  useEffect(() => {
    // Inicializa o Socket.io
    socketRef.current = io(SERVER_URL);

    socketRef.current.on('connect', () => {
      setStatus('Conectado ao servidor.');
    });

    socketRef.current.on('host-code-generated', (newCode) => {
      setCode(newCode);
      codeRef.current = newCode;
      setStatus('Aguardando suporte remoto...');
    });

    socketRef.current.on('viewer-connected', async () => {
      setStatus('Assistente conectado! Compartilhando tela...');
      await startScreenShare();
    });

    socketRef.current.on('webrtc-signal', async (signal) => {
      if (!pcRef.current) return;
      
      try {
        if (signal.type === 'offer') {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal));
          const answer = await pcRef.current.createAnswer();
          await pcRef.current.setLocalDescription(answer);
          socketRef.current.emit('webrtc-signal', { code: codeRef.current, signal: answer });
        } else if (signal.type === 'answer') {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(signal));
        } else if (signal.candidate) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(signal));
        }
      } catch (err) {
        console.error('Erro na sinalização', err);
      }
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, []);

  const requestAccessibility = async () => {
    // Redireciona o usuário para ativar a Acessibilidade no Android
    if (Platform.OS === 'android') {
      try {
        const isRunning = await RemoteControl.isServiceRunning();
        if (!isRunning) {
          Alert.alert(
            "Atenção",
            "Para permitir o controle remoto, você precisa ativar o 'Slim Remote Accessibility' nas Configurações.",
            [
              { text: "Cancelar", style: "cancel" },
              { text: "Abrir Configurações", onPress: () => Linking.openSettings() }
            ]
          );
        } else {
          Alert.alert("Sucesso", "O Serviço de controle já está ativo!");
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const startScreenShare = async () => {
    try {
      // Solicita a captura de tela (MediaProjection)
      const stream = await mediaDevices.getDisplayMedia({ video: true });
      streamRef.current = stream;

      // Configura a conexão WebRTC
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });
      pcRef.current = pc;

      // Adiciona o vídeo da tela à conexão
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Configura o DataChannel para receber os cliques
      pc.ondatachannel = (event) => {
        const channel = event.channel;
        channel.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.type === 'click') {
              // Envia as coordenadas para o módulo nativo clicar na tela
              RemoteControl.simulateClick(data.x, data.y);
            }
          } catch (err) {
            console.error('Erro ao processar clique', err);
          }
        };
      };

      // Envia os ICE Candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socketRef.current.emit('webrtc-signal', { code: codeRef.current, signal: event.candidate });
        }
      };

      // Cria a oferta P2P
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current.emit('webrtc-signal', { code: codeRef.current, signal: offer });

    } catch (e) {
      console.error("Erro ao capturar tela", e);
      setStatus("Falha ao iniciar captura de tela.");
    }
  };

  const generateCode = () => {
    if (socketRef.current) {
      socketRef.current.emit('host-request-code');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Slim Remote</Text>
        <Text style={styles.subtitle}>Suporte Rápido e Fácil</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.status}>{status}</Text>
        
        {code ? (
          <View style={styles.codeContainer}>
            <Text style={styles.codeLabel}>Seu Código de Acesso:</Text>
            <Text style={styles.code}>{code}</Text>
            <Text style={styles.hint}>Passe este código para o assistente.</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.buttonMain} onPress={generateCode}>
            <Text style={styles.buttonText}>Gerar Código</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.permissionsBox}>
        <Text style={styles.permissionsTitle}>Permissões Necessárias</Text>
        <Text style={styles.permissionsText}>
          Para que possamos controlar sua TV Box remotamente, precisamos que você conceda a permissão de Acessibilidade.
        </Text>
        <TouchableOpacity style={styles.buttonSecondary} onPress={requestAccessibility}>
          <Text style={styles.buttonSecondaryText}>Conceder Permissão</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    padding: 20,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#818cf8',
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
    marginTop: 5,
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 5,
  },
  status: {
    color: '#22c55e',
    fontSize: 16,
    marginBottom: 20,
    fontWeight: '500',
  },
  buttonMain: {
    backgroundColor: '#6366f1',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 10,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  codeContainer: {
    alignItems: 'center',
  },
  codeLabel: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 10,
  },
  code: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 8,
  },
  hint: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 10,
  },
  permissionsBox: {
    marginTop: 40,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    padding: 20,
    borderRadius: 10,
  },
  permissionsTitle: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  permissionsText: {
    color: '#cbd5e1',
    fontSize: 14,
    marginBottom: 15,
    lineHeight: 20,
  },
  buttonSecondary: {
    backgroundColor: '#334155',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonSecondaryText: {
    color: '#fff',
    fontWeight: '600',
  }
});

export default App;
