// Hutong Moles / Arduino Uno: input and lights only. All game rules live in the browser.
const byte BUTTONS[6] = {A0, A1, A2, A3, A4, A5};
const byte LEDS[6] = {2, 3, 4, 5, 6, 7};
bool raw[6], stable[6];
unsigned long changed[6];
char line[24];
byte length = 0;
bool overflow = false, testing = false, scanning = true, booting = true;
byte scanIndex = 0;
unsigned long scanAt = 0;

void allLeds(bool value) {
  for (byte i = 0; i < 6; i++) digitalWrite(LEDS[i], value ? HIGH : LOW);
}
void startScan(unsigned long now) {
  allLeds(false); scanIndex = 0; scanAt = now; scanning = true;
  digitalWrite(LEDS[0], HIGH);
}
void command(unsigned long now) {
  line[length] = '\0';
  if (!strcmp(line, "TEST") && !booting) {
    testing = true; startScan(now);
  } else if (!strcmp(line, "PING")) {
    Serial.println(F("PONG"));
  } else if (!booting) {
    if (!strcmp(line, "ALL:1") || !strcmp(line, "ALL:0")) {
      scanning = false; testing = false; allLeds(line[4] == '1');
    } else if (length == 4 && line[0] == 'O' && line[1] == 'N' && line[2] == ':' && line[3] >= '0' && line[3] <= '5') {
      scanning = false; testing = false; digitalWrite(LEDS[line[3] - '0'], HIGH);
    } else if (length == 5 && !strncmp(line, "OFF:", 4) && line[4] >= '0' && line[4] <= '5') {
      scanning = false; testing = false; digitalWrite(LEDS[line[4] - '0'], LOW);
    }
  }
}
void setup() {
  Serial.begin(115200);
  for (byte i = 0; i < 6; i++) {
    pinMode(BUTTONS[i], INPUT_PULLUP); pinMode(LEDS[i], OUTPUT);
    raw[i] = stable[i] = digitalRead(BUTTONS[i]); changed[i] = millis();
  }
  startScan(millis());
}
void loop() {
  const unsigned long now = millis();
  if (scanning && now - scanAt >= 150) {
    digitalWrite(LEDS[scanIndex], LOW); scanAt = now;
    if (++scanIndex < 6) digitalWrite(LEDS[scanIndex], HIGH);
    else {
      scanning = false;
      if (booting) { booting = false; Serial.println(F("READY")); }
    }
  }
  // Bound work per loop so a noisy serial sender cannot stall button debounce/self-test.
  for (byte consumed = 0; consumed < 32 && Serial.available(); consumed++) {
    const char ch = Serial.read();
    if (ch == '\n') {
      if (length && line[length - 1] == '\r') length--;
      if (!overflow) command(now);
      length = 0; overflow = false;
    } else if (!overflow) {
      if (length < sizeof(line) - 1) line[length++] = ch;
      else { overflow = true; length = 0; }
    }
  }
  for (byte i = 0; i < 6; i++) {
    const bool value = digitalRead(BUTTONS[i]);
    if (value != raw[i]) { raw[i] = value; changed[i] = now; }
    if (now - changed[i] >= 20 && stable[i] != raw[i]) {
      stable[i] = raw[i];
      if (stable[i] == LOW && !booting) {
        if (testing) { Serial.print(F("键 ")); Serial.print(i); Serial.println(F(" 按下")); }
        else { Serial.print(F("HIT:")); Serial.println(i); }
      }
    }
  }
}
