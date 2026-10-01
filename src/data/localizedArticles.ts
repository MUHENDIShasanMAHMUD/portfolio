type LocalizedArticle = {
  title: string;
  description: string;
  content: string;
};

type LocalizedArticleSet = Record<string, LocalizedArticle>;

export const localizedArticles: Record<'tr' | 'en', LocalizedArticleSet> = {
  tr: {
    'isr-ringbuffer': {
      title: 'Gömülü Sistemlerde Donanım Kesmeleri ve Ring Buffer Yönetimi',
      description: 'ISR ve Ring Buffer ile veri kaybına dayanıklı UART alımı tasarlamak için kapsamlı bir teknik inceleme.',
      content: `
<h2>Giriş: UART neden dikkatli bir tasarım gerektirir?</h2>
<p>Gömülü sistemlerde UART basit bir arayüz gibi görünür: bir alım hattı, bir gönderim hattı ve belirli bir baud rate. Ancak cihaz endüstriyel bir ortamda bir sensörden, aktüatörden veya kablosuz iletişim modülünden sürekli veri aldığında bu bakış açısı yetersiz kalır.</p>
<p>Mesajlar işlemcinin kontrol hesapları yaptığı, belleğe kayıt yazdığı veya başka bir protokolle ilgilendiği anda gelebilir. Alım yolu bloklayıcı tasarlanır ya da yavaş bir polling döngüsüne dayanırsa program önceki byte'ı okuyamadan yeni byte gelir.</p>
<p>Sonuç <code>Overrun Error</code>, eksik bir mesaj veya protokol senkronizasyonunun kaybıdır. Daha kötüsü, hata birkaç saatte bir görülebilir; bu yüzden cihazı yalnızca sakin koşullarda test etmek yeterli değildir.</p>
<p>Bu makale <code>Interrupt Service Routine</code> ve dairesel <code>Ring Buffer</code> kullanan pratik bir alım katmanını, çözümün sınırlarını ve ne zaman DMA'ya geçilmesi gerektiğini açıklar.</p>
<h2>1. Problemi zaman açısından tanımlamak</h2>
<p>UART'ın 8 veri biti, bir başlangıç biti ve bir durdurma biti ile 115200 baud hızında çalıştığını varsayalım. Her byte hat üzerinde yaklaşık 10 bit kaplar.</p>
<p>Bir byte'ın süresi yaklaşık olarak:</p>
<pre><code>10 / 115200 = 86.8 microseconds</code></pre>
<p>Bu, bir sonraki byte gelmeden önce işlemcinin 87 mikrosaniyeden daha az zamanı olabileceği anlamına gelir. Düşük hızlı bir mikrodenetleyicide veya kritik bir bölüm çalışırken bu pencere çok kısadır.</p>
<p>921600 baud hızında süre yalnızca yaklaşık 10.8 mikrosaniyeye düşer. Ortalama işlemci yükü düşük olsa bile geleneksel polling gerçek bir riske dönüşür.</p>
<p>Önemli olan ortalama değil, en kötü tepki süresidir. Sistem durumların %99'unda hızlı yanıt verse bile kritik mesaj aktarılırken başarısız olabilir.</p>
<h2>2. Polling neden başarısız olur?</h2>
<p>Polling modelinde ana döngü aşağıdakine benzer:</p>
<pre><code>while (1) {
    if (UART_STATUS_REG &amp; UART_RX_READY) {
        uint8_t byte = UART_DATA_REG;
        process_byte(byte);
    }

    read_sensor();
    update_display();
    run_control_loop();
}</code></pre>
<p>Sorun satırın kendisi değil, diğer işlemlerin UART durumunu kontrol etmek ile veri kaydını okumak arasına koyduğu süredir.</p>
<p><code>update_display()</code> tek bir byte'ın süresinden uzun sürerse donanım yeni byte'ı alım kaydının üzerine yazabilir veya overflow durumunu bildirebilir.</p>
<p>Döngüyü kısaltmak riski azaltabilir, fakat problemi program ile donanım arasındaki sürekli bir yarışa dönüştürür. Doğru çözüm yakalama anını olay kaynağına yakın bir kesmeye taşımaktır.</p>
<h2>3. ISR ne yapmalıdır?</h2>
<p>Altın kural ISR'ın kısa ve deterministik olmasıdır.</p>
<p>Yalnızca şu adımları gerçekleştirmelidir:</p>
<ol><li>Kesme durumunu sabitlemek için durum kaydını okumak.</li><li>Byte'ı kaybetmeden veri kaydını okumak.</li><li>Byte'ı dairesel belleğe koymak.</li><li>Yazma indeksini ilerletmek.</li><li>Yer yoksa overflow kaydetmek.</li><li>Mümkün olduğunca hızlı çıkmak.</li></ol>
<p>ISR JSON ayrıştırmamalı, mesaj sonu aramamalı, <code>printf</code> çalıştırmamalı veya <code>delay</code> ile beklememelidir.</p>
<p>Her ek işlem diğer kesmelerin engellenme süresini artırır ve tepki süresinde değişkenlik oluşturur.</p>
<h2>4. Ring Buffer modeli</h2>
<p>Dairesel bellek, <code>head</code> yazma ve <code>tail</code> okuma için kullanılan iki mantıksal indisi olan sabit bir dizidir.</p>
<pre><code>buffer: [A][B][C][D][ ][ ][ ][ ]
          ^       ^
        tail     head</code></pre>
<p>ISR <code>head</code> konumuna yazar ve onu artırır. Ana döngü <code>tail</code> konumundan okur ve onu artırır.</p>
<p>Dizinin sonuna ulaşınca indeks sıfıra döner; yapı bu nedenle daireseldir.</p>
<p>Modulo işlemi kullanılabilir, ancak hızlı yollarda boyutun 2'nin kuvveti olması ve bit maskesi kullanılması tercih edilir:</p>
<pre><code>next = (index + 1u) &amp; (BUFFER_SIZE - 1u);</code></pre>
<p>Bu yöntem <code>BUFFER_SIZE</code> değerinin 64, 128 veya 256 gibi olmasını gerektirir; 100 uygun değildir.</p>
<h2>5. Doluluk politikasını seçmek</h2>
<p>Bellek dolduğunda birkaç politika uygulanabilir.</p>
<h3>Birinci politika: yeni byte'ı reddetmek</h3><p>Eski içerik korunur ve sistem overflow durumunu kaydeder. Mesajın başlangıcının kaybedilemeyeceği durumlar için uygundur.</p>
<h3>İkinci politika: en eski byte'ı düşürmek</h3><p>Yeni byte yazılmadan önce <code>tail</code> ilerletilir. En güncel veriyi korur, ancak mevcut mesajı geçersiz kılabilir.</p>
<h3>Üçüncü politika: alımı durdurmak</h3><p>Veri kaybı kaynağı durdurmaktan daha tehlikeli olduğunda kullanılır ve üst katmana alarm gönderilir.</p>
<p>Her proje için doğru olan tek bir politika yoktur; bunu sistem protokolü belirlemelidir.</p>
<h2>6. Görece güvenli bir C uygulaması</h2>
<p>Aşağıdaki örnek tek üreticili ve tek tüketicili bir alım belleğinin yapısını gösterir:</p>
<pre><code>#include &lt;stdbool.h&gt;
#include &lt;stdint.h&gt;

#define UART_RX_CAPACITY 256u
#define UART_RX_MASK (UART_RX_CAPACITY - 1u)

typedef struct {
    uint8_t data[UART_RX_CAPACITY];
    volatile uint16_t head;
    volatile uint16_t tail;
    volatile uint32_t overflow_count;
} uart_ring_t;

static uart_ring_t uart_rx;</code></pre>
<p>Boyutun derleme sırasında 2'nin kuvveti olduğu doğrulanmalıdır:</p>
<pre><code>_Static_assert((UART_RX_CAPACITY &amp; UART_RX_MASK) == 0u,
               "UART_RX_CAPACITY must be a power of two");</code></pre>
<p>Pratikte daha açık biçim şudur:</p>
<pre><code>_Static_assert((UART_RX_CAPACITY &amp; (UART_RX_CAPACITY - 1u)) == 0u,
               "capacity must be a power of two");</code></pre>
<h2>7. ISR'dan yazma işlevi</h2>
<pre><code>static void uart_rx_push_from_isr(uint8_t value) {
    uint16_t head = uart_rx.head;
    uint16_t next = (uint16_t)((head + 1u) &amp; UART_RX_MASK);

    if (next == uart_rx.tail) {
        uart_rx.overflow_count++;
        return;
    }

    uart_rx.data[head] = value;
    uart_rx.head = next;
}</code></pre>
<p>Komutların sırası önemlidir. Yeni <code>head</code> değeri yayınlanmadan önce byte diziye yazılmalıdır.</p>
<p><code>head</code> önce güncellenirse tüketici ISR'ın henüz yazmadığı bir konumu okuyabilir.</p>
<p>Bazı işlemcilerde 16 bit okuma ve yazma, veri yolu 8 bit ise atomik değildir. Böyle bir durumda işlemciye uygun bir tür seçilmeli veya erişim korunmalıdır.</p>
<h2>8. Ana döngüden okuma işlevi</h2>
<pre><code>bool uart_rx_pop(uint8_t *value) {
    uint16_t tail = uart_rx.tail;

    if (tail == uart_rx.head) {
        return false;
    }

    *value = uart_rx.data[tail];
    uart_rx.tail = (uint16_t)((tail + 1u) &amp; UART_RX_MASK);
    return true;
}</code></pre>
<p>Tek üreticili ve tek tüketicili modelde her indeksi yalnızca bir taraf yazar. Bu, ağır kilit ihtiyacını azaltır.</p>
<p>Yine de indeks genişliği ve bellek sıralaması işlemci ve derleyiciye göre incelenmelidir.</p>
<h2>9. Kesmenin donanıma bağlanması</h2>
<p>UART kayıtlarının adı STM32, AVR, NXP ve ESP32 arasında değişir, ancak mantıksal sıra aynıdır:</p>
<pre><code>void USART1_IRQHandler(void) {
    uint32_t status = USART1-&gt;ISR;

    if ((status &amp; USART_ISR_RXNE_RXFNE) != 0u) {
        uint8_t value = (uint8_t)USART1-&gt;RDR;
        uart_rx_push_from_isr(value);
    }

    if ((status &amp; USART_ISR_ORE) != 0u) {
        uart_rx_error_count++;
        (void)USART1-&gt;RDR;
    }
}</code></pre>
<p>Hata bayraklarının temizlenmesi durum ve veri kayıtlarının belirli bir sırayla okunmasını gerektirebilir; bu yüzden mikrodenetleyici kılavuzu okunmalıdır.</p>
<p>Başka bir işlemcinin örneğine güvenmek bayrağın açık kalmasına ve ISR'ın durmadan yeniden çalışmasına yol açabilir.</p>
<h2>10. Eşzamanlılık ve volatile bellek</h2>
<p><code>volatile</code>, derleyiciye değerin programın normal akışı dışında değişebileceğini söyler.</p>
<p>Ancak bileşik işlemleri atomik yapmaz, tam bir bellek bariyeri oluşturmaz ve eşzamanlı okumayı yazmayı kendiliğinden çözmez.</p>
<p>İndeks işlemcinin tek komutta okuyabileceği genişlikteyse bu senaryoda erişim güvenli olabilir. Değilse UART kesmesini kısa süreli devre dışı bırakmak veya uygun atomik mekanizma kullanmak gerekir.</p>
<p>Birkaç byte okumak için tüm kesmeler uzun süre kapatılmamalıdır. Kritik bölüm ölçülebilir olmalı ve mümkün olan en az komutu içermelidir.</p>
<h2>11. Bellek boyutunu analiz etmek</h2>
<p>Bellek boyutu rastgele seçilmez; en yüksek geliş hızından ve tüketicinin veriyi işleyemediği en kötü süreden hesaplanır.</p>
<pre><code>required_bytes &gt;= arrival_rate_bytes_per_second * blocked_time_seconds</code></pre>
<p>Kaynak saniyede 2000 byte gönderiyor ve ana döngü 30 milisaniye durabiliyorsa alt sınır 60 byte'tır; sonra güvenlik payı eklenir.</p>
<p>64 dar kalabilir, 128 veya 256 ise değişkenlik için daha iyi alan sağlar.</p>
<p>Büyük boyut RAM tüketir; bu nedenle bellek gerçek en kötü durumla dengelenmelidir.</p>
<h2>12. Taşımayı protokol ayrıştırmadan ayırmak</h2>
<p>ISR mesajın <code>0xAA</code> ile başladığını veya JSON olduğunu bilmemelidir.</p>
<p>Görevi byte'ları güvenle taşımaktır. Header, uzunluk ve CRC arayan durum makinesi ana döngü bağlamında çalışmalıdır.</p>
<pre><code>typedef enum {
    FRAME_WAIT_SYNC,
    FRAME_READ_LENGTH,
    FRAME_READ_PAYLOAD,
    FRAME_READ_CRC
} frame_state_t;</code></pre>
<p>Bu ayrım taşıma testini protokol testinden bağımsız kılar ve ISR'ın büyümesini engeller.</p>
<h2>13. Mesaj sınırlarını bulmak</h2>
<p>Mesaj sonunu belirlemek için üç yaygın yöntem vardır:</p>
<ul><li><code>\n</code> veya <code>0x7E</code> gibi delimiter.</li><li>Mesaj başlığında açık uzunluk.</li><li>Byte'lar arasındaki sessizlik zaman aşımı.</li></ul>
<p>Açık uzunluk daha deterministiktir; ancak kopyalamadan önce üst sınır içinde olduğu doğrulanmalıdır.</p>
<p>Delimiter daha basittir, fakat değer payload içinde göründüğünde escape gerektirir.</p>
<p>Sessizlik zaman aşımı baud rate ve görev zamanlaması değişimlerine duyarlıdır; önemli bir endüstriyel protokolde tek başına kullanılmamalıdır.</p>
<h2>14. CRC ve bütünlük doğrulaması</h2>
<p>Ring Buffer yavaş ana döngünün neden olduğu byte kaybını önler, ancak verinin hat üzerinden sağlam geldiğini kanıtlamaz.</p>
<p>Çerçevede uygun bir CRC veya checksum bulunmalıdır.</p>
<pre><code>uint16_t crc16_update(uint16_t crc, uint8_t value) {
    crc ^= value;
    for (uint8_t bit = 0u; bit &lt; 8u; ++bit) {
        crc = (crc &amp; 1u) ? (crc &gt;&gt; 1u) ^ 0xA001u : (crc &gt;&gt; 1u);
    }
    return crc;
}</code></pre>
<p>CRC seçimi çerçeve uzunluğuna ve beklenen hata modeline bağlıdır. Protokol ardışık hataları yakalamayı gerektiriyorsa sırf kolay olduğu için basit checksum kullanılmamalıdır.</p>
<h2>15. Yaygın uygulama hataları</h2>
<ul><li><strong>İndeksi veriden önce güncellemek:</strong> Tüketicinin tamamlanmamış veriyi okumasına yol açar.</li><li><strong>Modulo ile uyumsuz boyut kullanmak:</strong> 2'nin kuvveti olmayan boyutta maske indeksi dizi dışına taşıyabilir.</li><li><strong>ISR içinde printf çalıştırmak:</strong> <code>printf</code> bloklayıcı ve ağır olabilir; iç kilit veya ortak bellek kullanabilir.</li><li><strong>Overflow'u yok saymak:</strong> Kaydedilmeyen hata teşhis edilemez; sayaç telemetry'de görünmelidir.</li><li><strong>Sınırsız diziye kopyalamak:</strong> Karşı taraftan gelen uzunluğa güvenilmemeli, kopyalamadan önce doğrulanmalıdır.</li><li><strong>Volatile'ın her şeyi çözdüğünü sanmak:</strong> Bu yalnızca gözlem aracıdır, tam bir eşzamanlılık protokolü değildir.</li></ul>
<h2>16. Birim testleri</h2>
<p>Önce belleği donanım olmadan test edin.</p>
<ol><li>Boş bellekten okuma.</li><li>Tek byte yazıp okuma.</li><li>Dizinin sonundan başına sarma.</li><li>Doluluk ve overflow sayımı.</li><li>Dönüşümlü yazma ve okuma.</li><li>Tüketici daha yavaşken sürekli yazma.</li><li>Çıkarıldıktan sonra verinin değişmemesi.</li></ol>
<p>Bu testler bilgisayarda normal C ile çalıştırılabilir, ardından kart üzerinde entegrasyon testleri eklenebilir.</p>
<h2>17. Yük testi</h2>
<p>Yük testinde uzun süre <code>0, 1, 2 ... 255</code> gibi sıralı bir desen gönderin.</p>
<p>Alıcı veriyi okuyup beklenen byte ile karşılaştırır. Aralık oluştuğunda hatanın taşımadan mı, parser'dan mı, yoksa overflow'dan mı geldiği anlaşılabilir.</p>
<p>Test ekran güncelleme, ADC okuma veya Flash kaydı gibi gerçeğe benzeyen görevler çalışırken yapılmalıdır.</p>
<p>Boş bir döngüdeki statik test gerçek ürünü temsil etmez.</p>
<h2>18. DMA ne zaman kullanılır?</h2>
<p>Baud rate yükselirse, mesajlar büyürse veya işlemci birden çok kanalla ilgilenirse byte başına kesme pahalı hale gelebilir.</p>
<p>Bu durumda dairesel veya çift bellekle DMA kullanılır.</p>
<p>DMA UART kaydından RAM'e her byte için işlemci müdahalesi olmadan taşır; sonra belleğin yarısında veya sonunda kesme kullanılır.</p>
<p>DMA doğru tasarım ihtiyacını ortadan kaldırmaz: yeni byte sayısı, indeks sarılması ve data cache bulunan işlemcilerde cache eşzamanlılığı bilinmelidir.</p>
<h2>19. Byte başına ISR ve DMA karşılaştırması</h2>
<table><thead><tr><th>Faktör</th><th>Byte başına ISR</th><th>Dairesel DMA</th></tr></thead><tbody><tr><td>Basitlik</td><td>Daha yüksek</td><td>Orta</td></tr><tr><td>İşlemci yükü</td><td>Baud rate ile artar</td><td>Düşük</td></tr><tr><td>Tepki süresi</td><td>Byte için mükemmel</td><td>Blok boyutuna bağlı</td></tr><tr><td>Karmaşıklık</td><td>Düşük</td><td>Daha yüksek</td></tr><tr><td>Uygun olduğu yer</td><td>Kısa mesajlar</td><td>Sürekli ve büyük akış</td></tr></tbody></table>
<p>Ölçülebilir en basit çözümle başlayın; sayılar ihtiyacı kanıtladığında DMA'ya geçin.</p>
<h2>20. Üründe izleme</h2>
<p>Çok fazla zaman harcamayan sayaçlar ekleyin:</p>
<ul><li>Alınan byte sayısı.</li><li>Overflow sayısı.</li><li>Framing ve parity hata sayısı.</li><li>Belleğin en yüksek kullanım seviyesi.</li><li>CRC nedeniyle reddedilen çerçeve sayısı.</li><li>Çerçeve işleme süresinin ortalaması.</li></ul>
<p>Bu sayaçlar müşteri sahasında sorun çıktığında saatler süren tahmini kısaltır.</p>
<h2>21. Sonuç</h2>
<p>İyi UART tasarımı yalnızca interrupt etkinleştirmek değildir. Donanım, ISR, Ring Buffer ve parser arasında açık bir sözleşmedir.</p>
<p>ISR byte'ı korur, bellek sırayı korur, durum makinesi çerçeveyi doğrular ve protokol hata durumunda ne yapılacağına karar verir.</p>
<p>En kötü durumlar ölçülür, overflow test edilir ve taşıma ile analiz ayrılırsa iletişim zor endüstriyel ortamlarda bile kararlı ve bakımı kolay olur.</p>`
    },
    'ota-architecture': {
      title: 'Endüstriyel Cihazlar için Güvenli OTA Mimarisi',
      description: 'ESP32 cihazlarında Wi-Fi ve BLE üzerinden doğrulama ve rollback içeren güvenli Firmware güncellemesi için kapsamlı tasarım.',
      content: `
<h2>Giriş: OTA yalnızca dosya yüklemek değildir</h2>
<p>Cihaz geliştirme laboratuvarındayken programlayıcı bağlanıp hatayı dakikalar içinde düzeltmek mümkündür. Ancak endüstriyel cihaz bir binanın çatısında, bir makinenin içinde veya kolay erişilemeyen bir yerde olabilir.</p>
<p>Bu durumda Firmware güncellemesi ek bir özellik değil, kritik bir işletim işlevidir.</p>
<p>Yazma sırasında kesinti cihazı <code>Brick</code> durumuna bırakabilir, güvenilmeyen dosya güvenlik açığı oluşturabilir ve kayıtlı verilerle uyumsuz bir güncelleme üretimi durdurabilir.</p>
<p>Bu nedenle OTA mimarisi tam bir güven zinciri olarak tasarlanır:</p>
<ol><li>Yeni sürümü keşfetmek.</li><li>Dosyayı parçalar halinde indirmek.</li><li>Kesintiden sonra aktarımı sürdürmek.</li><li>Boyut, hash ve imzayı doğrulamak.</li><li>Etkin olmayan bölüme yazmak.</li><li>Deneme açılışı yapmak.</li><li>Sürümü onaylamak veya rollback uygulamak.</li><li>Sonucu kaydedip sunucuya bildirmek.</li></ol>
<h2>1. Sistem gereksinimleri</h2>
<p>OTA kütüphanesi seçmeden önce kısıtlar tanımlanmalıdır.</p>
<p>Önce şu sorular sorulur:</p>
<ul><li>Ne kadar Flash kullanılabilir?</li><li>İki uygulama bölümü için yer var mı?</li><li>Sahadaki ağ hızı nedir?</li><li>Güç kesilirse ne olur?</li><li>Cihaz 24/7 mi çalışır?</li><li>Güncelleme şifreli olmalı mı?</li><li>Firmware yayınlama yetkisi kimde?</li><li>Yeni sürüm veri şemasıyla uyumlu mu?</li><li>Kabul edilebilir en uzun kesinti nedir?</li></ul>
<p>Bu yanıtlar partition table'ı, protokolü ve kurtarma politikasını belirler.</p>
<h2>2. Neden Dual-Bank?</h2>
<p>A/B veya Dual-Bank tasarımında en az iki uygulama bölümü bulunur.</p>
<pre><code>+------------------+
| Bootloader       |
+------------------+
| OTA Metadata     |
+------------------+
| App A            |  running
+------------------+
| App B            |  download target
+------------------+
| Filesystem       |
+------------------+</code></pre>
<p>App A çalışıyorsa yeni sürüm App B'ye yazılır. İndirme sırasında çalışan programa dokunulmaz.</p>
<p>Doğrulama tamamlandıktan sonra bootloader açılış göstergesini App B'ye çevirir. App B ilk testte başarısız olursa cihaz App A'ya döner.</p>
<p>Bu yapı güç kesintisinin programı bozma riskini azaltır, ancak daha fazla Flash alanı ister.</p>
<h2>3. Güncelleme durumları</h2>
<p>Dağınık flag'ler yerine açık bir durum makinesi kullanın.</p>
<pre><code>typedef enum {
    OTA_IDLE,
    OTA_CHECKING,
    OTA_DOWNLOADING,
    OTA_VERIFYING,
    OTA_PENDING_REBOOT,
    OTA_TRIAL_BOOT,
    OTA_CONFIRMED,
    OTA_ROLLBACK,
    OTA_FAILED
} ota_state_t;</code></pre>
<p>Her durumun belirli geçişleri ve kaydedilmiş hata nedenleri olmalıdır.</p>
<p>Örneğin boyut, hash ve imza doğrulanmadan <code>OTA_DOWNLOADING</code> durumundan <code>OTA_PENDING_REBOOT</code> durumuna geçilmemelidir.</p>
<p>Gerekli servisler çalışıp sağlık testi geçilmeden <code>OTA_CONFIRMED</code> durumuna geçilmemelidir.</p>
<h2>4. Sürümü keşfetmek</h2>
<p>Cihaz HTTPS üzerinden bir manifest sorgulayabilir.</p>
<pre><code>{
  "product": "kts200-controller",
  "version": "2.4.1",
  "min_bootloader": "1.3.0",
  "size": 786432,
  "sha256": "...",
  "signature": "...",
  "url": "https://updates.example.com/kts200-2.4.1.bin"
}</code></pre>
<p>Yalnızca <code>version</code> değerine güvenmeyin. Ürün, model ve hardware revision doğrulanmalıdır.</p>
<p>Rev A cihazı Rev B'deki GPIO tanımlarına sahip olmayabilir.</p>
<p>Eski sürümde güvenlik açığı varsa yetkisiz downgrade de engellenmelidir.</p>
<h2>5. HTTPS imzanın alternatifi değildir</h2>
<p>HTTPS cihaz ile sunucu arasındaki aktarımı korur, ancak sunucu veya yayın hesabı ele geçirilirse dosyanın ekibinizden geldiğini tek başına kanıtlamaz.</p>
<p>Firmware cihaz dışında tutulan özel anahtarla imzalanmalı, imza gömülü veya korumalı bir bölgede tutulan açık anahtarla doğrulanmalıdır.</p>
<pre><code>Firmware bytes -&gt; SHA-256 -&gt; digital signature
                                      |
                             public-key verification</code></pre>
<p>Özel anahtar depoya, geliştirici cihazına veya CI log'larına konulmaz.</p>
<p>Özel anahtar açığa çıkarsa anahtar döndürme ve sürümleri iptal etme planı gerekir.</p>
<h2>6. SHA-256 doğrulaması</h2>
<p>Hash dosyadaki bozulmayı veya değişikliği ortaya çıkarır.</p>
<pre><code>sha256_init(&amp;context);

while (download_has_data()) {
    size_t received = download_chunk(buffer, sizeof(buffer));
    sha256_update(&amp;context, buffer, received);
    flash_write(target_offset, buffer, received);
    target_offset += received;
}

sha256_final(&amp;context, digest);</code></pre>
<p>İlk birkaç byte'ı veya yalnızca dosya boyutunu karşılaştırmak yeterli değildir.</p>
<p>Tamamlanan digest, güvenilir manifestteki değerle karşılaştırılmalıdır.</p>
<p>Doğrulama başarısızsa yeni bölüm açılışa uygun hale getirilmemelidir.</p>
<h2>7. İndirmeyi Chunks olarak bölmek</h2>
<p>Tek seferde indirmek RAM tüketir ve devam etmeyi zorlaştırır.</p>
<p>Platforma göre TCP ve Flash'a uyan, örneğin 4 veya 16 kilobyte büyüklüğünde chunk'lar kullanmak daha iyidir.</p>
<p>Her parçada offset, length, sıra numarası, isteğe bağlı checksum, timeout ve deneme sayısı bulunmalıdır.</p>
<p>Ağ kesilince cihaz son onaylı offset'i okur ve oradan devam eder.</p>
<p>Güvenli devam için sunucunun HTTP Range veya eşdeğer bir protokolü desteklemesi gerekir.</p>
<h2>8. Flash'a yazmak</h2>
<p>Flash RAM gibi davranmaz.</p>
<p>Genellikle yeniden yazmadan önce tüm sector silinmelidir; erase olmadan bit 0'dan 1'e çevrilemez.</p>
<ol><li>Adresin gerekli sınıra hizalandığını doğrulayın.</li><li>Yalnızca hedef sektörleri silin.</li><li>Uygun büyüklükte parçalar yazın.</li><li>Gerektiğinde yazma sonrası okumayı doğrulayın.</li><li>Hassas metadata güncellenirken gücün kesilmemesini sağlayın.</li></ol>
<p>Wear leveling olmadan aynı sektöre binlerce kez sayaç yazmayın.</p>
<h2>9. Yerel veriyi korumak</h2>
<p>Firmware ve cihaz verisi farklı şeylerdir.</p>
<p>Güncelleme işlemi calibration, sayaçlar veya hata kayıtlarına bir migration planı olmadan dokunmamalıdır.</p>
<pre><code>typedef struct {
    uint32_t magic;
    uint16_t schema_version;
    uint16_t payload_length;
    uint32_t crc32;
} settings_header_t;</code></pre>
<p>Açılışta yeni sürüm eski şemayı okur ve migration'ı bir kez yapar.</p>
<p>Migration başarısız olursa yedek veya güvenli varsayılan değerler kullanılmalıdır.</p>
<h2>10. Bootloader ve açılış kaydı</h2>
<p>Bootloader kesintiye dayanıklı metadata'ya ihtiyaç duyar.</p>
<pre><code>typedef struct {
    uint32_t magic;
    uint8_t active_slot;
    uint8_t pending_slot;
    uint8_t boot_attempts;
    uint8_t confirmed;
    uint32_t metadata_crc;
} boot_record_t;</code></pre>
<p>Kayıt yarım güncellenmiş halde kalabilecek biçimde yazılmamalıdır.</p>
<p>Sequence number ve CRC içeren iki kayıt kopyası veya küçük bir journal kullanın.</p>
<p>Bootloader açılışta en yeni geçerli kaydı seçer.</p>
<h2>11. Trial Boot</h2>
<p>Yeni sürüm kurulduktan sonra hemen kararlı ilan edilmez.</p>
<p>Cihaz sınırlı deneme sayısıyla <code>trial</code> modunda başlar.</p>
<p>Bu aşamada uygulama scheduler'ın çalışmasını, temel belleği, doğru ayarları, kritik sensör bağlantılarını, watchdog güvenliğini, self-test'i ve heartbeat gönderebildiğini kontrol eder.</p>
<p>Her şey geçerse uygulama sürümü onaylayan işlevi çağırır.</p>
<p>Onaydan önce yeniden başlarsa bootloader deneme sayacını artırır ve sınır aşılınca önceki bölüme döner.</p>
<h2>12. Watchdog ve Rollback</h2>
<p>Watchdog yalnızca yeniden başlatma zamanlayıcısı değildir; OTA'da kurtarma politikasının parçasıdır.</p>
<p>Yeni uygulama başarı bildirmeden kilitlenirse watchdog cihazı yeniden başlatır.</p>
<p>Sonraki açılışta bootloader sürümün pending olduğunu ve onaylanmadığını görerek önceki kararlı sürümü seçer.</p>
<p>Bir rollback döngüsünü sayaçla sınırlayın ve nedeni kaydedin: crash, watchdog timeout, failed self-test, invalid signature, missing configuration veya network confirmation timeout.</p>
<h2>13. Şifreleme ve kimlik</h2>
<p>Bağlantıyı şifrelemek ile Firmware'i şifrelemek farklıdır.</p>
<p>HTTPS yolu korur; dosyanın kendisini şifrelemek depolama veya kopyalama sırasında gizliliği korur.</p>
<p>Her Firmware gizlilik gerektirmez, ancak çoğu zaman özgünlük ve bütünlük gerektirir.</p>
<p>Dosya şifreliyse çözme anahtarı cihaz içinde dikkatle yönetilmeli ve açık manifestte bulunmamalıdır.</p>
<p>Her cihazın iptal edilebilir bir token veya sertifikayla benzersiz kimliği olmalıdır.</p>
<h2>14. Sunucuda en az yetki</h2>
<p>Güncelleme sunucusu tüm veritabanlarını değiştirme yetkisine sahip olmamalıdır.</p>
<ul><li>Build ve imzalama servisi.</li><li>Yayın sonrası read-only dosya deposu.</li><li>Manifest yayınlama API'si.</li><li>Telemetry servisi.</li><li>İnceleme yetkileri paneli.</li></ul>
<p>Sürümü kimin, ne zaman ve hangi cihaz grubuna yayınladığını kaydedin.</p>
<p>Aşamalı güncelleme Firmware'i tüm cihazlara tek seferde göndermekten daha iyidir.</p>
<h2>15. Canary ve Staged Rollout</h2>
<p>Küçük bir cihaz yüzdesiyle başlayın.</p>
<p>Crash rate, rollback rate, açılış süresi ve bellek tüketimini izleyin.</p>
<p>Göstergeler izin verilen sınırı aşarsa yayını otomatik durdurun.</p>
<pre><code>1%   iki saat
10%  altı saat
30%  bir gün
100% sonuçlar onaylandıktan sonra</code></pre>
<p>İlk grup farklı sahaları, ağları ve cihazları temsil etmeli; yalnızca ilk bağlanan on cihaz olmamalıdır.</p>
<h2>16. BLE ve Web Serial güncellemesi</h2>
<p>İnternet olmayan ortamlarda yerel kanal gerekebilir.</p>
<p>BLE ilk kurulum veya küçük dosya için uygundur, ancak aktarım hızı, enerji ve menzil sınırlıdır.</p>
<p>Web Serial, USB veya uygun bir adaptörle bağlı teknisyenin tarayıcıdan Firmware aktarmasına izin verir.</p>
<p>Yerel güncelleme de dosyanın geçerliliğini kanıtlamalıdır; imza yerel olduğu için atlanmamalıdır.</p>
<p>Yerel kullanıcı fiziksel erişime sahip olabilir, ancak mutlaka güvenilir taraf değildir.</p>
<h2>17. Güç kesintisiyle başa çıkmak</h2>
<p>Her aşamada güç kesintisini test edin: erase sırasında, chunk yazarken, son chunk'tan sonra hash'ten önce, hash'ten sonra boot flag değiştirilmeden önce, trial boot sırasında ve veri migration'ı sırasında.</p>
<p>Her durum güvenli devamla veya geçerli bir sürüme dönüşle sonuçlanmalıdır.</p>
<p>Tüm doğrulamalar tamamlanmadan active slot yazılmamalıdır.</p>
<h2>18. Güvenlik testleri</h2>
<p>Şunların reddedildiğini test edin:</p>
<ul><li>Hatalı imzalı dosya.</li><li>İmzadan sonra değiştirilmiş dosya.</li><li>Uyumsuz ürün.</li><li>Minimum sürümden düşük sürüm.</li><li>Bölümden büyük dosya.</li><li>Eksik manifest.</li><li>Süresi dolmuş sertifika.</li><li>Güvenilmeyen sunucu.</li><li>Eski Replay aktarımı.</li></ul>
<p>Flash doluluğu, DNS hatası, timeout, güç dalgalanması ve ağın kesilmesi de test edilmelidir.</p>
<h2>19. Uyumluluk testleri</h2>
<table><thead><tr><th>Bootloader</th><th>Firmware</th><th>Schema</th><th>Sonuç</th></tr></thead><tbody><tr><td>1.3</td><td>2.4</td><td>7</td><td>Desteklenir</td></tr><tr><td>1.2</td><td>2.4</td><td>7</td><td>Reddedilir</td></tr><tr><td>1.3</td><td>2.3</td><td>6</td><td>Desteklenir</td></tr><tr><td>1.3</td><td>1.1</td><td>2</td><td>Downgrade reddedilir</td></tr></tbody></table>
<p>Yalnızca metin sürümüne güvenmeyin; major, minor, hardware revision ve migration politikasını karşılaştırın.</p>
<h2>20. Yayından sonra izleme</h2>
<p>Güvenli ve küçük telemetry gönderin: bootloader sürümü, Firmware sürümü, etkin bölüm, son açılış nedeni, trial deneme sayısı, son self-test sonucu, schema sürümü ve son heartbeat zamanı.</p>
<p>Güncelleme kayıtlarına sır veya kişisel veri koymayın.</p>
<h2>21. Yaygın hatalar</h2>
<ul><li><strong>Çalışan bölüme yazmak:</strong> Laboratuvarda başarılı olsa da güç kesilince başarısız olur.</li><li><strong>Dosya adına güvenmek:</strong> <code>firmware-final.bin</code> hiçbir şeyi kanıtlamaz; referans imzadır.</li><li><strong>Rollback'i test etmemek:</strong> Test edilmemiş özellik kurtarma planı değildir.</li><li><strong>Firmware ile veriyi karıştırmak:</strong> Tasarımsız silme calibration veya cihaz kimliğini yok edebilir.</li><li><strong>Deneme sınırı koymamak:</strong> Cihaz reboot loop'a girip pili tüketebilir.</li><li><strong>Canary olmadan herkese yayınlamak:</strong> Tek hata bütün filoyu durdurabilir.</li></ul>
<h2>22. Tam akış modeli</h2>
<pre><code>Device -&gt; fetch manifest
Device -&gt; verify product and version
Device -&gt; download chunks to inactive slot
Device -&gt; calculate SHA-256
Device -&gt; verify signature
Device -&gt; mark slot pending
Device -&gt; reboot
Bootloader -&gt; start trial slot
Firmware -&gt; run self-test
Firmware -&gt; confirm slot
Device -&gt; report success</code></pre>
<p>Yeniden başlatmadan önce herhangi bir koşul başarısız olursa eski bölüm etkin kalır.</p>
<p>Uygulama açılıştan sonra başarısız olursa bootloader sonraki açılışta devreye girer.</p>
<h2>23. Sonuç</h2>
<p>Güvenli OTA bir dosya indirme endpoint'i değil, yazılım için tam bir yaşam döngüsüdür.</p>
<p>İyi mimari indirme, doğrulama, yazma, açılış ve onay adımlarını ayırır.</p>
<p>Dual-Bank çalışan sürümü korur, imza kaynağı kanıtlar, SHA-256 bozulmayı yakalar, watchdog kurtarmayı destekler ve Canary hatanın etkisini azaltır.</p>
<p>Güç kesintisi, kötü amaçlı dosya, veri uyumluluğu ve aşamalı yayın test edildiğinde cihaz güncellemesi uzak endüstriyel sahalarda bile güvenilir bir hizmet olur.</p>`
    },
    'performance-optimization': {
      title: 'Performans Optimizasyonu ve Kullanıcı Deneyimi',
    description: "Core Web Vitals, LCP, görsel optimizasyonu ve teknik SEO'yu kapsayan uygulamalı bir Astro vaka çalışması.",
      content: `
<h2>Mühendislik platformlarında performans felsefesi</h2>
<p>Mekatronik ve gömülü sistem projelerini sergileyen kişisel bir platformun yapısı da mühendislik standartlarını yansıtmalıdır: <strong>yüksek verimlilik, düşük kaynak tüketimi ve anında yanıt</strong>.</p>
<p><strong>Hasan TechLab</strong>'in son güncellemesinde yazılım darboğazlarını ele alıp Google PageSpeed Insights ve Google Lighthouse raporlarındaki performans puanlarını masaüstü ve telefonda yükseltmeye odaklandım. Amaç tek testte yüksek sayı değil, gerçek koşullarda hızlı, kararlı ve ölçülebilir bir deneyim kurmaktı.</p>
<h2>Değişiklikten önce performansı nasıl ölçtüm?</h2>
<p>Her dosyayı değiştirmeden önce açık bir baseline kaydettim. Telefon ağı, işlemci ve bellek sonucu büyük ölçüde değiştirdiği için masaüstü ve mobil sürümleri inceledim:</p>
<ul><li><strong>LCP - Largest Contentful Paint:</strong> Görünen en büyük öğenin ortaya çıkma süresi.</li><li><strong>INP - Interaction to Next Paint:</strong> Kullanıcı etkileşimine arayüzün yanıt hızı.</li><li><strong>CLS - Cumulative Layout Shift:</strong> Yükleme sırasında öğelerin ne kadar hareket ettiği.</li><li><strong>TTFB - Time to First Byte:</strong> İstek ile sunucudan ilk byte arasındaki süre.</li><li>JavaScript, CSS ve görsellerin boyutu, istek sayısı ve render'ı engelleyen kaynaklar.</li></ul>
<p><strong>Lab Data</strong> ile gerçek kullanıcı <strong>Field Data</strong> ayrımı önemlidir. Lighthouse darboğazları hızlıca bulur; gerçek kullanıcı raporları eski cihazların, yavaş ağların ve farklı ekran boyutlarının etkisini gösterir.</p>
<h2>Uygulanan başlıca iyileştirmeler</h2>
<h3>1. Görsel boyutlarını ve yüklenmesini ele almak</h3>
<ul><li><strong>Sorun:</strong> Profil fotoğrafı 1440×1440 piksel ve yaklaşık 101 KB olarak yüklenirken arayüzde 38×38 piksel gösteriliyordu. Bu, mobil ağlarda veri tüketimini ve <strong>LCP (Largest Contentful Paint)</strong> süresini artırdı.</li><li><strong>Çözüm:</strong> Görsel gerçek gösterim boyutuna yaklaştırıldı ve web için hafif bir formatla sıkıştırıldı. Bu öğenin aktarım boyutunun %95'inden fazlası azaltıldı.</li></ul>
<p>WebP veya AVIF seçip aynı büyük kaynağı göndermek yeterli değildir. Kaynağın boyutları beklenen gösterim boyutuyla eşleşmeli, <code>width</code> ve <code>height</code> belirtilmeli, farklı boyutlarda <code>srcset</code> kullanılmalıdır. İlk ekrandaki görsel uygun yükleme önceliği ister; ekran altındaki görseller gerektiğinde yüklenebilir.</p>
<h3>2. JavaScript ve kaynak maliyetini azaltmak</h3>
<p>Her JavaScript dosyası indirme, ayrıştırma ve çalıştırma maliyeti getirir. Etkileşimli kodu gözden geçirip ilk sayfada yalnızca gerekli davranışı tuttum; küçük bir iş için büyük kütüphane yüklemedim. Astro'nun statik bileşenleri, tam istemci tarafı yeniden çizimine göre daha az JavaScript gönderir.</p>
<p>Pratik kural JavaScript'in açık bir etkileşime hizmet etmesidir: pencere açmak, dil değiştirmek, e-posta kopyalamak veya projeyle etkileşmek. Sabit metin ve temel yapı tarayıcıya hazır HTML olarak ulaşmalıdır.</p>
<h3>3. Yerleşimi sabitlemek ve erişimi iyileştirmek</h3>
<p>Performans erişilebilirlikten ayrı değildir. Görsel boyutlarını ayarlamak, doğru başlık sırasını korumak, düğmelere açık etiketler vermek ve klavyeyi desteklemek görsel karmaşayı azaltır. Yükleme sırasında yerleşimin değişmemesi CLS'yi doğrudan düşürür.</p>
<h3>4. Dinamik XML Sitemap üretmek</h3>
<ul><li><strong>Sorun:</strong> Sitemap arama motorlarının doğrudan okuyabileceği düzenli biçimde üretilmiyordu.</li><li><strong>Çözüm:</strong> Resmi <code>@astrojs/sitemap</code> paketi <code>astro.config.mjs</code> içine eklendi ve temel site adresi ayarlandı:</li></ul>
<pre><code>import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://hasantechlab.com',
  integrations: [sitemap()]
});</code></pre>
<p>Bu işlem platforma yeni makale veya sayfa eklendiğinde sitemap'i otomatik günceller.</p>
<p>Ancak sitemap tek başına indeksleme garantisi vermez. Sayfalar dahili bağlantılarla ulaşılabilir olmalı, açık bir title, description ve canonical URL içermeli, <code>robots.txt</code> tarafından engellenmemelidir. Yayından sonra dosyayı Google Search Console'da kontrol eder, indeksleme hatalarını izlerim.</p>
<h3>5. Teknik SEO'yu ve içerik yapısını iyileştirmek</h3>
<p>Makale tek bir ana başlıkla başlıyor; alt başlıklar problemi, çözümü ve sonucu açıklıyor. Bu yapı kullanıcı ve arama motoru için okumayı kolaylaştırır. Anahtar kelimeler başlık, açıklama, alt başlık ve görsel alternatif metninde doğal kullanılmalıdır; ifade yapay biçimde tekrarlanmamalıdır.</p>
<p>Bu çalışmanın kapsamını tanımlayan terimler arasında <strong>web sitesi hızını artırma, web performansı, Core Web Vitals, LCP optimizasyonu, CLS azaltma, INP iyileştirme, teknik SEO, Astro Performance, Astro Sitemap, görsel sıkıştırma, Google Lighthouse ve PageSpeed Insights</strong> bulunur.</p>
<h3>6. Yayın sonrası doğrulama planı</h3>
<ol><li>Geliştirme yerine production build çalıştırmak.</li><li>Dosya boyutlarını ve render'ı engelleyen kaynakları incelemek.</li><li>Masaüstü ve mobil Lighthouse çalıştırmak.</li><li>Yavaş ağda ve küçük ekranda test etmek.</li><li><code>sitemap-index.xml</code>, <code>robots.txt</code> ve temel bağlantıları doğrulamak.</li><li>Search Console'u ve yeterli trafik geldikten sonra gerçek kullanıcı verisini izlemek.</li></ol>
<p>Bu döngü bir metriği iyileştirirken başka deneyimi bozmayı önler. Önemli bir görseli ertelemek sayfa boyutunu düşürürken LCP'yi bozabilir; JavaScript'i fazla azaltmak etkileşimi veya erişimi kırabilir.</p>
<h2>7. Sayfa yükleme yolculuğunu incelemek</h2>
<p>Sayfa, kullanıcı ilk harfi görmeden önce başlar. Tarayıcı alan adını çözer, bağlantı kurar, istek gönderir, ilk byte'ı bekler; sonra HTML'i analiz edip CSS, görseller, fontlar ve script'leri keşfeder.</p>
<p>Bu zincirdeki her kaynak darboğaz olabilir. LCP'yi yalnızca görsel sorunu olarak değil, DNS, TTFB, render engelleyen CSS veya kaynak keşfini geciktiren JavaScript açısından izlerim.</p>
<p>Doğru teşhis şunu sorar: Tarayıcı kaynağı ilk ne zaman bilebilirdi ve onu kullanmasını ne engelledi?</p>
<h2>8. Font stratejisi</h2>
<p>Özel fontlar görsel kimliği güçlendirir, ancak yanlış yönetilirse <code>FOIT</code> veya <code>FOUT</code> oluşturabilir.</p>
<p>Sınırlı ağırlıklar kullanır, sayfada görünmeyen ağırlığı yüklemez ve metnin hemen görünmesi anlık eşleşmeden önemli olduğunda <code>font-display: swap</code> ayarlarım.</p>
<p>Google Fonts kullanırken dış isteklerin DNS ve TLS etkisi incelenmelidir. Kritik sayfalarda dosyalar yerel barındırılabilir ve tüm Unicode kümesi yerine gereken dil için subset seçilebilir.</p>
<h2>9. Render'ı engelleyen CSS</h2>
<p>Büyük veya gereksiz CSS ilk çizimi geciktirebilir. Kritik stiller sayfanın ilk bölümünün ihtiyaç duymadığı stillerden ayrılmalıdır.</p>
<p>Bu, dosyaları rastgele bölmek demek değildir. CSS boyutu ölçülmeli, tekrar eden veya sayfanın kullanmadığı kütüphaneden gelen kurallar belirlenmelidir.</p>
<p>Astro HTML'i sabit tutmaya yardımcı olur; yine de CSS import biçimi ve bileşen sayısı nihai çıktıyı etkiler.</p>
<h2>10. İlk sayfadaki JavaScript</h2>
<p>Her script indirme, ayrıştırma ve çalıştırma maliyeti ekler. Dil değiştirme veya proje ayrıntısı açma gibi bazı etkileşimler gereklidir; tanıtım sitesinin tamamını istemci uygulamasına dönüştürmeye gerek yoktur.</p>
<p>Önemli içerik HTML'de bulunmalı ve etkileşim kademeli eklenmelidir. Bu SEO'yu iyileştirir ve JavaScript tamamlanmadan da sayfayı kullanılabilir kılar.</p>
<p>Okunabilirliği ve klavye davranışını koruyarak benzer öğelerde çok sayıda listener yerine event delegation kullanmak da yararlıdır.</p>
<h2>11. Ölçülebilir görsel optimizasyonu</h2>
<p>Her görselin gerçek gösterim ölçüsünü belirlerim. 38×38 boyutundaki avatarın 1440×1440 dosyaya ihtiyacı yoktur.</p>
<p>Sonra formatı içeriğe göre seçerim:</p>
<ul><li>WebP çoğu görsel için iyi sıkıştırma sunar.</li><li>AVIF daha küçük olabilir; destek ve decode hızı test edilmelidir.</li><li>PNG, şeffaflık veya keskin kenar gerektiğinde uygundur.</li><li>SVG basit ikonlar için uygundur; kaynak ve güven kontrol edilmelidir.</li></ul>
<p>LCP'yi temsil eden görsele <code>loading="lazy"</code> uygulamam. Viewport'tan uzaktaki görseller ise çoğu zaman lazy loading'den yararlanır.</p>
<h2>12. Cumulative Layout Shift'i önlemek</h2>
<p>CLS, kullanıcı gördükten sonra bir öğe hareket ettiğinde oluşur. Yaygın nedenler boyutsuz görsel, alanı ayrılmamış reklam veya metin boyutunu değiştiren fonttur.</p>
<p><code>width</code>, <code>height</code> veya <code>aspect-ratio</code> tanımlamak kaynağın gelmesinden önce tarayıcıya alan verir.</p>
<p>Yüklemeden sonra üstte boşluk ayırmadan uyarı çubuğu eklenmemeli ve geç gelen font nedeniyle düğmelerin yüksekliği değişmemelidir.</p>
<h2>13. INP ve etkileşimi iyileştirmek</h2>
<p>INP kullanıcının etkileşimine sayfanın yanıt hızını ölçer. Sayfa hızlı görünse bile dil düğmesi veya makale penceresi yanıt vermiyorsa yeterli değildir.</p>
<p>Uzun JavaScript görevleri tarayıcının ekranı güncellemesini engeller. İş bölünebilir, gereksiz kısım ertelenebilir ve büyük DOM işlemleri azaltılabilir.</p>
<p>Makale arayüzünde pencere hızlı açılmalı, kod etkileşimle ilgisiz bölümleri yeniden kurmamalıdır.</p>
<h2>14. TTFB ve cache</h2>
<p>TTFB sunucu konumundan, cache'den, sayfa üretme süresinden ve üçüncü taraf isteklerinden etkilenir. Astro'daki statik sayfalar istek anındaki üretim süresini azaltır; yine de CDN, Cache-Control ve yayın bölgesi ayarlanmalıdır.</p>
<pre><code>Cache-Control: public, max-age=31536000, immutable</code></pre>
<p>Hash içeren asset'ler uzun süre cache'lenebilir. HTML ve sitemap ise güncellemelerin ulaşması için daha kısa politika ister. Cache'in eski <code>robots.txt</code> veya sitemap sunmadığı doğrulanmalıdır.</p>
<h2>15. Performans bütçesi</h2>
<p>“Site hızlı” gibi genel bir ifade yerine gözden geçirilebilir bir bütçe belirlerim:</p>
<table><thead><tr><th>Kaynak</th><th>Önerilen sınır</th></tr></thead><tbody><tr><td>Sıkıştırılmış JavaScript</td><td>150 KB'dan az</td></tr><tr><td>Sıkıştırılmış CSS</td><td>80 KB'dan az</td></tr><tr><td>Ana görsel</td><td>120 KB'dan az</td></tr><tr><td>İlk istek sayısı</td><td>30'dan az</td></tr><tr><td>4G'de LCP</td><td>2.5 saniyeden az</td></tr><tr><td>CLS</td><td>0.1'den az</td></tr></tbody></table>
<p>Bunlar evrensel yasa değildir; ancak Pull Request'te regression keşfini mümkün kılar.</p>
<h2>16. Lighthouse ve PageSpeed Insights karşılaştırması</h2>
<p>Lighthouse tekrarlanabilir laboratuvar koşullarında çalışır ve değişiklik öncesi sonrası için mükemmeldir.</p>
<p>PageSpeed Insights, varsa CrUX verisini gösterir; bu veri farklı cihaz ve ağlardaki gerçek kullanıcı deneyimine daha yakındır.</p>
<p>Tek sonucu bağlamından koparmam. Ölçümü tekrarlar, medyanı karşılaştırır ve mobil ile masaüstü dağılımını incelerim.</p>
<h2>17. Gerçek mobil testi</h2>
<p>Emülatör her zaman sınırlı belleğe sahip eski bir telefonu temsil etmez. Gerçek cihazda test eder, yavaş ağ veya throttling kullanır, metnin görünme süresini ve düğmelerin yanıtını izlerim.</p>
<p>Manuel test; başlığın sarılması, tablonun ekrandan taşması veya kapatma düğmesinin pencere kenarıyla çakışması gibi sayıların göstermediği sorunları ortaya çıkarır.</p>
<h2>18. Teknik SEO ve içerik yapısı</h2>
<p>Her sayfanın faydasını açıklayan açık bir başlığı ve anahtar kelime listesi olmayan bir açıklaması olmalıdır. Başlık ana konuyu, açıklama sonucu, alt başlıklar gerçek soruları anlatır.</p>
<p>Aynı ifadeyi onlarca kez kullanmak kaliteyi düşürebilir. Hız optimizasyonu, web performansı, Core Web Vitals ve teknik SEO gibi yakın terimler yararlı bağlamda ele alınmalıdır.</p>
<p>Sitemap başlıkların keşfine yardım eder, dahili bağlantılar ise arama motoruna aralarındaki ilişkiyi anlatır. Bu nedenle performans, OTA ve Ring Buffer makaleleri genel bağlantılar yerine açık bağlamla ilişkilendirilir.</p>
<h2>19. Erişilebilirlik performansın parçasıdır</h2>
<p>Klavye ile kullanılamayan hızlı sayfa tamamlanmış ürün değildir.</p>
<p>Tab sırasını, focus görünürlüğünü, düğme metinlerini, kontrastı ve makalenin uygun <code>lang</code> ile <code>dir</code> değerlerini kontrol ederim.</p>
<p>Görsel boyutlarını sabitlemek CLS'yi azaltır; hiyerarşik başlıklar ve açık etiketler ekran okuyucularının gezinmesine yardım eder. Bu yüzden erişilebilirlik ile performans metrikleri düşündüğümüzden daha çok kesişir.</p>
<h2>20. İzleme ve regression önleme</h2>
<p>İyi bir sürümden sonra yeni bir görsel veya kütüphane performansı bozabilir. Bu yüzden build raporunu ve dosya boyutlarını gözden geçirir, temel bileşen değişince Lighthouse'ı tekrar çalıştırırım.</p>
<p>Ölçüm sonuçlarını tarihleriyle saklarım; iyileşmenin kalıcı mı geçici mi olduğunu bilirim. Ayrıca sitemap, robots.txt ve Search Console indeksleme durumunu izlerim.</p>
<h2>21. Yaygın optimizasyon hataları</h2>
<ul><li>İçindeki metni düşünmeden tüm görselleri sıkıştırmak.</li><li>LCP görselini lazy loading ile ertelemek.</li><li>Gerekli JavaScript'i kaldırıp daha büyük biçimde geri eklemek.</li><li>Lighthouse'a yalnızca bir kez güvenmek.</li><li>Metinle ilgisiz anahtar kelimeler eklemek.</li><li>Temel <code>site</code> değerini ayarlamadan sitemap üretmek.</li><li>Sayfayı sağdan sola test etmeyi unutmak.</li></ul>
<h2>22. Yayın öncesi kontrol listesi</h2>
<ol><li>Production build hatasız çalışıyor mu?</li><li>Benzersiz title ve description görünüyor mu?</li><li>Her görselin boyutu ve uygun alternatif metni var mı?</li><li>Mobilde LCP hedefin altında mı?</li><li>Font ve görseller yüklenirken CLS kararlı mı?</li><li>Dil ve pencere düğmeleri klavyeyle çalışıyor mu?</li><li>Dahili makale bağlantıları doğru mu?</li><li>Sitemap ve robots.txt erişilebilir mi?</li><li>Gereksiz dış kaynak var mı?</li><li>Makale sayfası küçük ekranda test edildi mi?</li></ol>
<h2>Elde edilen sonuçlar ve sayılar</h2>
<table><thead><tr><th>Metrik</th><th>Masaüstü</th><th>Mobil</th></tr></thead><tbody><tr><td>Performance</td><td>100 / 100</td><td>90+ / 100</td></tr><tr><td>Best Practices</td><td>100 / 100</td><td>100 / 100</td></tr><tr><td>SEO</td><td>100 / 100</td><td>100 / 100</td></tr><tr><td>Accessibility</td><td>96 / 100</td><td>96 / 100</td></tr><tr><td>Sunucu yanıt süresi</td><td>0.8 saniye</td><td>Hızlı ve kararlı</td></tr></tbody></table>
<h2>Daha sonra ne iyileştirilebilir?</h2>
<p>Mevcut sonuçlar güçlü bir noktadır, ancak iş bitmiş değildir. Sonraki adımlar ziyaretçilerden gerçek veri toplamak, kalan görselleri iyileştirmek, font boyutlarını gözden geçirmek ve büyük görsellerle kırık bağlantıların geri gelmesini önleyen otomatik testler eklemektir. Sabit asset'ler için daha hassas cache politikası ve makale sayısı arttıkça makale performansını izleme de eklenebilir.</p>
<h2>Sonuç</h2>
<p>Performans kozmetik bir adım değil, ürün kalitesinin parçasıdır. Asset boyutunu azaltmak, JavaScript'i ayarlamak, Core Web Vitals'ı iyileştirmek, erişilebilir HTML yazmak ve doğru sitemap sağlamak, hız ile keşfedilebilirliği birlikte yükselten bağlantılı kararlardır. En iyi sonuç tek bir hileden değil, etkisi sayılarla kanıtlanabilen sürekli ölçüm ve küçük kararlardan gelir.</p>`
    }
  },
  en: {
    'isr-ringbuffer': {
      title: 'Hardware Interrupts and Ring Buffer Management in Embedded Systems',
      description: 'A complete technical guide to designing loss-resistant UART reception with an ISR and a Ring Buffer.',
      content: `
<h2>Introduction: why UART deserves careful design</h2>
<p>In embedded systems, UART looks simple: one receive line, one transmit line, and a defined baud rate. That view breaks down when an industrial device continuously receives data from a sensor, actuator, or wireless module.</p>
<p>Messages may arrive while the processor is running control calculations, writing a record to memory, or handling another protocol. If reception is blocking or relies on slow polling, a new byte can arrive before the previous byte is read.</p>
<p>The result is an <code>Overrun Error</code>, an incomplete message, or lost protocol synchronization. Worse, the failure may appear once every few hours, so testing only in calm conditions is not enough.</p>
<p>This article explains a practical receive layer based on an <code>Interrupt Service Routine</code> and a circular <code>Ring Buffer</code>, its limits, and when to move to DMA.</p>
<h2>1. Define the problem in time</h2>
<p>Assume UART runs at 115200 baud with 8 data bits, one start bit, and one stop bit. Each byte occupies roughly 10 bits on the line.</p>
<p>The time for one byte is approximately:</p>
<pre><code>10 / 115200 = 86.8 microseconds</code></pre>
<p>That means the processor may have less than 87 microseconds before the next byte arrives. On a slow microcontroller or inside a critical section, this window is very short.</p>
<p>At 921600 baud the time is only about 10.8 microseconds. Traditional polling becomes a real risk even when average CPU load is low.</p>
<p>The important value is worst-case response time, not the average. A system that responds quickly in 99% of cases can still fail while a critical message is in transit.</p>
<h2>2. Why polling fails</h2>
<p>A polling model may look like this:</p>
<pre><code>while (1) {
    if (UART_STATUS_REG &amp; UART_RX_READY) {
        uint8_t byte = UART_DATA_REG;
        process_byte(byte);
    }

    read_sensor();
    update_display();
    run_control_loop();
}</code></pre>
<p>The problem is not the line itself, but the time other operations place between checking UART status and reading the data register.</p>
<p>If <code>update_display()</code> takes longer than one byte time, hardware may overwrite the receive register or report an overflow.</p>
<p>Shortening the loop reduces the risk, but turns the problem into a permanent race between software and hardware. The correct solution moves capture close to the event source, into an interrupt.</p>
<h2>3. What should the ISR do?</h2>
<p>The golden rule is that an ISR must be short and deterministic.</p>
<p>It should perform only these steps:</p>
<ol><li>Read the status register to latch the interrupt state.</li><li>Read the data register before the byte is lost.</li><li>Put the byte in the circular buffer.</li><li>Advance the write index.</li><li>Record overflow if there is no space.</li><li>Exit as quickly as possible.</li></ol>
<p>The ISR should not parse JSON, search for an end marker, call <code>printf</code>, or wait with <code>delay</code>.</p>
<p>Every additional operation increases the time other interrupts are blocked and creates response-time jitter.</p>
<h2>4. Ring Buffer model</h2>
<p>A circular buffer is a fixed array with two logical indexes: <code>head</code> for writing and <code>tail</code> for reading.</p>
<pre><code>buffer: [A][B][C][D][ ][ ][ ][ ]
          ^       ^
        tail     head</code></pre>
<p>The ISR writes at <code>head</code> and advances it. The main loop reads at <code>tail</code> and advances it.</p>
<p>When the end of the array is reached, the index returns to zero; this is why the structure is circular.</p>
<p>Modulo can be used, but fast paths preferably use a power-of-two size and a bit mask:</p>
<pre><code>next = (index + 1u) &amp; (BUFFER_SIZE - 1u);</code></pre>
<p>This requires <code>BUFFER_SIZE</code> to be 64, 128, or 256, for example, rather than 100.</p>
<h2>5. Choose an overflow policy</h2>
<p>When the buffer is full, several policies are possible.</p>
<h3>Policy one: reject the new byte</h3><p>Old content remains intact and the system records overflow. This suits messages whose beginning must not be lost.</p>
<h3>Policy two: drop the oldest byte</h3><p>Advance <code>tail</code> before writing the new byte. This preserves the newest data but may invalidate the current message.</p>
<h3>Policy three: stop reception</h3><p>Use this when losing data is more dangerous than stopping the source and raising an alarm to the higher-level system.</p>
<p>There is no universally correct policy; the system protocol must define it.</p>
<h2>6. A relatively safe C implementation</h2>
<p>The following example shows a single-producer, single-consumer receive buffer:</p>
<pre><code>#include &lt;stdbool.h&gt;
#include &lt;stdint.h&gt;

#define UART_RX_CAPACITY 256u
#define UART_RX_MASK (UART_RX_CAPACITY - 1u)

typedef struct {
    uint8_t data[UART_RX_CAPACITY];
    volatile uint16_t head;
    volatile uint16_t tail;
    volatile uint32_t overflow_count;
} uart_ring_t;

static uart_ring_t uart_rx;</code></pre>
<p>Build-time validation should ensure that the capacity is a power of two:</p>
<pre><code>_Static_assert((UART_RX_CAPACITY &amp; UART_RX_MASK) == 0u,
               "UART_RX_CAPACITY must be a power of two");</code></pre>
<p>In practice, the clearer form is:</p>
<pre><code>_Static_assert((UART_RX_CAPACITY &amp; (UART_RX_CAPACITY - 1u)) == 0u,
               "capacity must be a power of two");</code></pre>
<h2>7. The ISR write function</h2>
<pre><code>static void uart_rx_push_from_isr(uint8_t value) {
    uint16_t head = uart_rx.head;
    uint16_t next = (uint16_t)((head + 1u) &amp; UART_RX_MASK);

    if (next == uart_rx.tail) {
        uart_rx.overflow_count++;
        return;
    }

    uart_rx.data[head] = value;
    uart_rx.head = next;
}</code></pre>
<p>Instruction order matters. The byte must be written to the array before publishing the new <code>head</code>.</p>
<p>If <code>head</code> is updated first, the consumer may read a position that the ISR has not written yet.</p>
<p>On some processors, 16-bit reads and writes are not atomic when the data bus is 8-bit. In that case, use a processor-appropriate type or protect the access.</p>
<h2>8. The main-loop read function</h2>
<pre><code>bool uart_rx_pop(uint8_t *value) {
    uint16_t tail = uart_rx.tail;

    if (tail == uart_rx.head) {
        return false;
    }

    *value = uart_rx.data[tail];
    uart_rx.tail = (uint16_t)((tail + 1u) &amp; UART_RX_MASK);
    return true;
}</code></pre>
<p>In a single-producer, single-consumer model, each index is written by only one side. This reduces the need for heavy locks.</p>
<p>Still, index width and memory ordering must be reviewed for the processor and compiler.</p>
<h2>9. Connect the interrupt to hardware</h2>
<p>UART register names differ across STM32, AVR, NXP, and ESP32, but the logical sequence is the same:</p>
<pre><code>void USART1_IRQHandler(void) {
    uint32_t status = USART1-&gt;ISR;

    if ((status &amp; USART_ISR_RXNE_RXFNE) != 0u) {
        uint8_t value = (uint8_t)USART1-&gt;RDR;
        uart_rx_push_from_isr(value);
    }

    if ((status &amp; USART_ISR_ORE) != 0u) {
        uart_rx_error_count++;
        (void)USART1-&gt;RDR;
    }
}</code></pre>
<p>Read the microcontroller manual because clearing error flags may require a specific order for reading status and data registers.</p>
<p>Relying on an example from another controller can leave the flag asserted and restart the ISR continuously.</p>
<h2>10. Concurrency and volatile memory</h2>
<p><code>volatile</code> tells the compiler that a value may change outside the program's normal flow.</p>
<p>It does not make compound operations atomic, create a full memory barrier, or automatically solve concurrent reads and writes.</p>
<p>If the index fits a width the processor can read in one instruction, access may be safe in this scenario. Otherwise, briefly disable the UART interrupt or use a suitable atomic mechanism.</p>
<p>Do not disable all interrupts for a long time just to read a few bytes. The critical section should be measurable and contain as few instructions as possible.</p>
<h2>11. Analyze buffer size</h2>
<p>Buffer size is not arbitrary. Calculate it from the highest arrival rate and the worst time during which the consumer cannot process data.</p>
<pre><code>required_bytes &gt;= arrival_rate_bytes_per_second * blocked_time_seconds</code></pre>
<p>If the source sends 2000 bytes per second and the main loop can stop for 30 milliseconds, the minimum is 60 bytes, followed by a safety margin.</p>
<p>64 may be tight, while 128 or 256 provides better room for jitter.</p>
<p>Larger buffers consume RAM, so balance memory against the actual worst case.</p>
<h2>12. Separate transport from protocol parsing</h2>
<p>Do not make the ISR know that a message starts with <code>0xAA</code> or is JSON.</p>
<p>Its job is to transport bytes safely. A state machine looking for a header, length, and CRC should run in the main-loop context.</p>
<pre><code>typedef enum {
    FRAME_WAIT_SYNC,
    FRAME_READ_LENGTH,
    FRAME_READ_PAYLOAD,
    FRAME_READ_CRC
} frame_state_t;</code></pre>
<p>This separation makes transport tests independent from protocol tests and prevents the ISR from growing.</p>
<h2>13. Detect message boundaries</h2>
<p>Three common methods identify the end of a message:</p>
<ul><li>A delimiter such as <code>\n</code> or <code>0x7E</code>.</li><li>An explicit length in the message header.</li><li>An idle timeout between bytes.</li></ul>
<p>Explicit length is more deterministic, but it must be checked against a maximum before copying.</p>
<p>A delimiter is simpler, but needs escaping when its value appears inside the payload.</p>
<p>An idle timeout is sensitive to baud-rate changes and task scheduling, so it should not be the only mechanism in an important industrial protocol.</p>
<h2>14. CRC and integrity validation</h2>
<p>A Ring Buffer prevents byte loss caused by a slow loop, but does not prove that data arrived intact over the wire.</p>
<p>The frame should contain a suitable CRC or checksum.</p>
<pre><code>uint16_t crc16_update(uint16_t crc, uint8_t value) {
    crc ^= value;
    for (uint8_t bit = 0u; bit &lt; 8u; ++bit) {
        crc = (crc &amp; 1u) ? (crc &gt;&gt; 1u) ^ 0xA001u : (crc &gt;&gt; 1u);
    }
    return crc;
}</code></pre>
<p>CRC choice depends on frame length and the required error model. Do not use a simple checksum merely because it is easier when the protocol needs to detect burst errors.</p>
<h2>15. Common implementation mistakes</h2>
<ul><li><strong>Updating the index before the data:</strong> The consumer can read incomplete data.</li><li><strong>Using an incompatible modulo size:</strong> A mask with a non-power-of-two size can move the index outside the array.</li><li><strong>Calling printf inside the ISR:</strong> <code>printf</code> may block, be expensive, and use an internal lock or shared buffer.</li><li><strong>Ignoring overflow:</strong> An unrecorded error cannot be diagnosed; count it and expose it in telemetry.</li><li><strong>Copying into an unbounded array:</strong> Never trust a remote length; validate before copying.</li><li><strong>Assuming volatile solves everything:</strong> It is an observation tool, not a complete concurrency protocol.</li></ul>
<h2>16. Unit tests</h2>
<p>Test the buffer without hardware first.</p>
<ol><li>Reading from an empty buffer.</li><li>Writing and reading one byte.</li><li>Wrapping from the end of the array to the beginning.</li><li>Full condition and overflow counting.</li><li>Alternating writes and reads.</li><li>Continuous writes with a slower consumer.</li><li>Ensuring data does not change after it is removed.</li></ol>
<p>Run these tests on a computer with ordinary C, then add integration tests on the board.</p>
<h2>17. Stress testing</h2>
<p>In a stress test, send a sequence such as <code>0, 1, 2 ... 255</code> for a long period.</p>
<p>The receiver compares every byte with the expected value. A gap reveals whether the failure came from transport, the parser, or overflow.</p>
<p>Run the test while realistic tasks such as display updates, ADC reads, or Flash logging are active.</p>
<p>A static test in an empty loop does not represent the real product.</p>
<h2>18. When should DMA be used?</h2>
<p>If baud rate rises, messages grow, or the processor handles several channels, an interrupt per byte can become expensive.</p>
<p>Use DMA with a circular or double buffer in that case.</p>
<p>DMA moves data from the UART register to RAM without processor intervention for each byte; then use an interrupt at the buffer half-way point or end.</p>
<p>DMA does not remove the need for sound design: know the number of new bytes, handle index wrapping, and manage cache coherency on processors with a data cache.</p>
<h2>19. Per-byte ISR versus DMA</h2>
<table><thead><tr><th>Factor</th><th>Per-byte ISR</th><th>Circular DMA</th></tr></thead><tbody><tr><td>Simplicity</td><td>Higher</td><td>Medium</td></tr><tr><td>CPU load</td><td>Increases with baud rate</td><td>Low</td></tr><tr><td>Response time</td><td>Excellent per byte</td><td>Depends on batch size</td></tr><tr><td>Complexity</td><td>Low</td><td>Higher</td></tr><tr><td>Best for</td><td>Short messages</td><td>Large continuous streams</td></tr></tbody></table>
<p>Start with the simplest measurable solution and move to DMA when the numbers prove it is needed.</p>
<h2>20. Production monitoring</h2>
<p>Add counters that do not consume much time:</p>
<ul><li>Received byte count.</li><li>Overflow count.</li><li>Framing and parity error counts.</li><li>Peak buffer usage.</li><li>Frames rejected because of CRC.</li><li>Average frame-processing time.</li></ul>
<p>These counters replace hours of guesswork when a field issue appears.</p>
<h2>21. Conclusion</h2>
<p>Good UART design is more than enabling an interrupt. It is a clear contract between hardware, the ISR, the Ring Buffer, and the parser.</p>
<p>The ISR preserves bytes, the buffer preserves order, the state machine validates the frame, and the protocol decides what to do on failure.</p>
<p>When worst cases are measured, overflow is tested, and transport is separated from analysis, communication remains stable and maintainable even in demanding industrial environments.</p>`
    },
    'ota-architecture': {
      title: 'Secure OTA Architecture for Industrial Devices',
      description: 'A complete design for secure ESP32 firmware updates over Wi-Fi and BLE with verification and rollback.',
      content: `<h2>Introduction: OTA is more than uploading a file</h2><p>When a device is in a development lab, a programmer can be connected and a failure corrected within minutes. An industrial device may instead be on a rooftop, inside a machine, or at a site that is hard to reach.</p><p>In that situation, Firmware updating is a critical operational function rather than an optional feature.</p><p>An interruption during writing can leave the device <code>Brick</code>ed, an untrusted file can create a security exposure, and an update incompatible with stored data can stop production.</p><p>Design OTA as a complete chain of trust:</p><ol><li>Discover a new version.</li><li>Download the file in chunks.</li><li>Resume after interruption.</li><li>Verify size, hash, and signature.</li><li>Write to the inactive partition.</li><li>Perform a trial boot.</li><li>Confirm the version or roll back.</li><li>Record and report the result.</li></ol><h2>1. System requirements</h2><p>Define constraints before choosing an OTA library.</p><p>Ask: how much Flash is available; is there room for two application partitions; what is the site network speed; what happens during power loss; does the device run 24/7; must the update be encrypted; who may publish Firmware; is the new version compatible with the data schema; and what is the maximum acceptable outage?</p><p>These answers determine the partition table, protocol, and recovery policy.</p><h2>2. Why Dual-Bank?</h2><p>An A/B or Dual-Bank design has at least two application partitions.</p><pre><code>+------------------+
| Bootloader       |
+------------------+
| OTA Metadata     |
+------------------+
| App A            |  running
+------------------+
| App B            |  download target
+------------------+
| Filesystem       |
+------------------+</code></pre><p>If App A is running, write the new version to App B. Do not touch the running program during download.</p><p>After verification, the bootloader changes the boot pointer to App B. If App B fails its first test, return to App A.</p><p>This reduces corruption risk during power loss but requires more Flash.</p><h2>3. Update states</h2><p>Use an explicit state machine instead of scattered flags.</p><pre><code>typedef enum {
    OTA_IDLE,
    OTA_CHECKING,
    OTA_DOWNLOADING,
    OTA_VERIFYING,
    OTA_PENDING_REBOOT,
    OTA_TRIAL_BOOT,
    OTA_CONFIRMED,
    OTA_ROLLBACK,
    OTA_FAILED
} ota_state_t;</code></pre><p>Every state needs defined transitions and recorded failure reasons.</p><p>For example, do not move from <code>OTA_DOWNLOADING</code> to <code>OTA_PENDING_REBOOT</code> until size, hash, and signature are valid. Do not reach <code>OTA_CONFIRMED</code> until required services run and the health test passes.</p><h2>4. Discover the version</h2><p>The device can query a manifest over HTTPS:</p><pre><code>{
  "product": "kts200-controller",
  "version": "2.4.1",
  "min_bootloader": "1.3.0",
  "size": 786432,
  "sha256": "...",
  "signature": "...",
  "url": "https://updates.example.com/kts200-2.4.1.bin"
}</code></pre><p>Do not trust <code>version</code> alone. Verify product, model, and hardware revision. A Rev A device may not have the GPIO definitions of Rev B. Also prevent unauthorized downgrade when an older release contains a vulnerability.</p><h2>5. HTTPS is not a substitute for signing</h2><p>HTTPS protects transport between device and server, but does not by itself prove that the file came from your team if the server or publishing account is compromised.</p><p>Sign Firmware with a private key kept off-device and verify it with an embedded or protected public key.</p><pre><code>Firmware bytes -&gt; SHA-256 -&gt; digital signature
                                      |
                             public-key verification</code></pre><p>Never put the private key in the repository, a developer device, or CI logs. If it is exposed, you need key rotation and release revocation plans.</p><h2>6. Verify SHA-256</h2><p>The hash detects corruption or modification.</p><pre><code>sha256_init(&amp;context);

while (download_has_data()) {
    size_t received = download_chunk(buffer, sizeof(buffer));
    sha256_update(&amp;context, buffer, received);
    flash_write(target_offset, buffer, received);
    target_offset += received;
}

sha256_final(&amp;context, digest);</code></pre><p>Comparing a few leading bytes or the file size is not enough. Compare the complete digest with the value in the trusted manifest. If verification fails, do not make the new partition bootable.</p><h2>7. Split downloads into chunks</h2><p>Downloading at once consumes RAM and makes resuming difficult.</p><p>Use chunks sized for TCP and Flash, such as 4 or 16 kilobytes depending on the platform. Each chunk needs an offset, length, sequence number, optional checksum, timeout, and retry count.</p><p>After a network interruption, the device reads the last confirmed offset and continues. Safe resumption requires HTTP Range or an equivalent server protocol.</p><h2>8. Write to Flash</h2><p>Flash does not behave like RAM. A complete sector often must be erased before rewriting, and a bit cannot change from 0 to 1 without erase.</p><ol><li>Ensure the address is aligned as required.</li><li>Erase only target sectors.</li><li>Write suitable batches.</li><li>Verify by reading back when needed.</li><li>Do not cut power while sensitive metadata is updated.</li></ol><p>Do not write a counter thousands of times to one sector without wear leveling.</p><h2>9. Protect local data</h2><p>Firmware and device data are different things. Updating must not touch calibration, counters, or fault logs without a migration plan.</p><pre><code>typedef struct {
    uint32_t magic;
    uint16_t schema_version;
    uint16_t payload_length;
    uint32_t crc32;
} settings_header_t;</code></pre><p>At boot, the new version reads the old schema and migrates it once. If migration fails, use a backup or safe defaults.</p><h2>10. Bootloader and boot record</h2><p>The bootloader needs interruption-resistant metadata.</p><pre><code>typedef struct {
    uint32_t magic;
    uint8_t active_slot;
    uint8_t pending_slot;
    uint8_t boot_attempts;
    uint8_t confirmed;
    uint32_t metadata_crc;
} boot_record_t;</code></pre><p>Do not write the record in a way that can leave it half updated. Use two copies or a small journal with a sequence number and CRC; the bootloader selects the newest valid record.</p><h2>11. Trial Boot</h2><p>Do not declare the new version stable immediately after installation.</p><p>Start in <code>trial</code> mode with a limited number of attempts. Check scheduler operation, basic memory, valid settings, critical sensor connections, watchdog health, self-test success, and the ability to send a heartbeat.</p><p>If everything passes, the application confirms the version. If it reboots first, the bootloader increments the attempt count and returns to the previous partition after the limit.</p><h2>12. Watchdog and Rollback</h2><p>Watchdog is not just a reboot timer; in OTA it is part of the recovery policy.</p><p>If the new application hangs before reporting success, watchdog restarts the device. At the next boot the bootloader sees an unconfirmed pending version and selects the previous stable version.</p><p>Prevent an endless rollback loop with a counter and record the reason: crash, watchdog timeout, failed self-test, invalid signature, missing configuration, or network confirmation timeout.</p><h2>13. Encryption and identity</h2><p>Transport encryption and Firmware encryption are different. HTTPS protects the path; encrypting the file protects confidentiality while it is stored or copied.</p><p>Not every Firmware needs confidentiality, but it usually needs authenticity and integrity. If the file is encrypted, manage the decryption key carefully inside the device and never put it in an exposed manifest.</p><p>Each device should have a unique identity and a revocable certificate or token.</p><h2>14. Least privilege for the server</h2><p>The update server should not be able to modify every database.</p><ul><li>Build and signing service.</li><li>Read-only file store after publication.</li><li>Manifest API.</li><li>Telemetry service.</li><li>Review and permissions panel.</li></ul><p>Record who published each version, when, and to which device group. A gradual rollout is better than sending Firmware to every device at once.</p><h2>15. Canary and staged rollout</h2><p>Start with a small percentage of devices.</p><p>Watch crash rate, rollback rate, boot time, and memory use. Stop deployment automatically if metrics cross allowed limits.</p><pre><code>1%   for two hours
10%  for six hours
30%  for one day
100% after results are approved</code></pre><p>The first group should represent different sites, networks, and devices, not merely the first ten connected devices.</p><h2>16. BLE and Web Serial updates</h2><p>Where the internet is unavailable, a local channel may be needed.</p><p>BLE suits initial setup or a small file, but transfer speed, power, and range are limited.</p><p>Web Serial lets a technician connected through USB or a suitable adapter transfer Firmware from a browser.</p><p>Local updating must still prove the file is valid; it must not bypass signing merely because it is local. Physical access does not necessarily make the local user trusted.</p><h2>17. Handle power loss</h2><p>Test power loss at every stage: during erase, while writing a chunk, after the last chunk but before hashing, after hashing but before changing the boot flag, during trial boot, and during data migration.</p><p>Each case must end in safe continuation or a return to a valid version. Never write the active slot before all verification is complete.</p><h2>18. Security tests</h2><p>Test rejection of an incorrectly signed file, a file modified after signing, a mismatched product, a version below the minimum, a file larger than the partition, an incomplete manifest, an expired certificate, an untrusted server, and an old replay.</p><p>Also test full Flash, DNS failure, timeout, and power fluctuation.</p><h2>19. Compatibility tests</h2><table><thead><tr><th>Bootloader</th><th>Firmware</th><th>Schema</th><th>Result</th></tr></thead><tbody><tr><td>1.3</td><td>2.4</td><td>7</td><td>Supported</td></tr><tr><td>1.2</td><td>2.4</td><td>7</td><td>Rejected</td></tr><tr><td>1.3</td><td>2.3</td><td>6</td><td>Supported</td></tr><tr><td>1.3</td><td>1.1</td><td>2</td><td>Downgrade rejected</td></tr></tbody></table><p>Do not rely on a text version alone. Compare major, minor, hardware revision, and migration policy.</p><h2>20. Post-deployment monitoring</h2><p>Send small, safe telemetry: bootloader version, Firmware version, active partition, last boot reason, trial attempt count, last self-test result, schema version, and last heartbeat time.</p><p>Do not send secrets or personal data in update logs.</p><h2>21. Common mistakes</h2><ul><li><strong>Writing to the active partition:</strong> It may work in a lab and fail during power loss.</li><li><strong>Trusting the file name:</strong> <code>firmware-final.bin</code> proves nothing; the signature is the authority.</li><li><strong>Not testing rollback:</strong> An untested feature is not a recovery plan.</li><li><strong>Mixing Firmware and data:</strong> An unplanned erase can delete calibration or device identity.</li><li><strong>No attempt limit:</strong> The device can enter a reboot loop and drain its battery.</li><li><strong>Full rollout without a canary:</strong> One mistake can disable an entire fleet.</li></ul><h2>22. Complete flow model</h2><pre><code>Device -&gt; fetch manifest
Device -&gt; verify product and version
Device -&gt; download chunks to inactive slot
Device -&gt; calculate SHA-256
Device -&gt; verify signature
Device -&gt; mark slot pending
Device -&gt; reboot
Bootloader -&gt; start trial slot
Firmware -&gt; run self-test
Firmware -&gt; confirm slot
Device -&gt; report success</code></pre><p>If any condition fails before reboot, the old partition remains active. If the application fails after boot, the bootloader intervenes at the next boot.</p><h2>23. Conclusion</h2><p>Secure OTA is a complete software lifecycle, not a file-download endpoint.</p><p>A good architecture separates download, verification, writing, boot, and confirmation.</p><p>Dual-Bank protects the running version, signing proves the source, SHA-256 detects corruption, watchdog supports recovery, and Canary reduces the impact of failure.</p><p>When power loss, malicious files, data compatibility, and staged rollout are tested, device updating becomes a service that can be trusted even at remote industrial sites.</p>`
    },
    'performance-optimization': {
      title: 'Performance Optimization and User Experience',
      description: 'A complete Astro case study covering Core Web Vitals, LCP, image optimization, and technical SEO.',
      content: `<h2>Performance philosophy for engineering platforms</h2><p>A personal platform for mechatronics and embedded-systems projects should reflect precise engineering standards: <strong>high efficiency, low resource use, and immediate response</strong>.</p><p>In the latest Hasan TechLab update, I focused on software bottlenecks and performance scores in Google PageSpeed Insights and Google Lighthouse on desktop and mobile. The goal was not one high score, but a fast, stable, measurable experience in real conditions.</p><h2>How did I measure performance before the change?</h2><p>I recorded a clear baseline before changing any file. I reviewed desktop and mobile because network, processor, and memory change the result:</p><ul><li><strong>LCP - Largest Contentful Paint:</strong> Time until the largest visible element appears.</li><li><strong>INP - Interaction to Next Paint:</strong> Interface response speed after user interaction.</li><li><strong>CLS - Cumulative Layout Shift:</strong> How much elements move during loading.</li><li><strong>TTFB - Time to First Byte:</strong> Time between the request and the first server byte.</li><li>JavaScript, CSS, and image size, request count, and render-blocking resources.</li></ul><p>The distinction between <strong>Lab Data</strong> and real-user <strong>Field Data</strong> matters. Lighthouse quickly finds bottlenecks, while real-user reports reveal old devices, slow networks, and different screen sizes.</p><h2>Key improvements</h2><h3>1. Image dimensions and loading</h3><ul><li><strong>Problem:</strong> The profile image loaded at 1440×1440 pixels and about 101 KB while it was displayed at 38×38 pixels. This increased data use and delayed <strong>LCP</strong> on mobile networks.</li><li><strong>Solution:</strong> I resized and compressed the image to a lightweight web format close to its display size, saving more than 95% of this element's transfer size.</li></ul><p>Choosing WebP or AVIF and sending the original image is not enough. Resource dimensions should match the expected display size, <code>width</code> and <code>height</code> should be declared, and <code>srcset</code> should be used when multiple sizes exist. An above-the-fold image needs appropriate loading priority; images below the viewport can load when needed.</p><h3>2. Reduce JavaScript and resource cost</h3><p>Every JavaScript file adds download, parse, and execution cost. I reviewed interactive code, kept only essential first-page behavior, and avoided loading a large library for a small task. Astro's static components send less JavaScript than a full client-side redraw.</p><p>The practical rule is that JavaScript should serve a clear interaction: opening a window, changing language, copying an email, or interacting with a project. Static text and the basic structure should arrive as ready HTML.</p><h3>3. Stabilize layout and improve accessibility</h3><p>Performance is inseparable from accessibility. Setting image dimensions, preserving heading order, giving buttons clear labels, and supporting the keyboard reduce visual confusion. Avoiding layout changes during loading directly lowers CLS.</p><h3>4. Generate a dynamic XML Sitemap</h3><ul><li><strong>Problem:</strong> The sitemap was not generated in an organized form search engines could read directly.</li><li><strong>Solution:</strong> The official <code>@astrojs/sitemap</code> package was integrated into <code>astro.config.mjs</code> with the base site URL:</li></ul><pre><code>import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://hasantechlab.com',
  integrations: [sitemap()]
});</code></pre><p>This keeps the sitemap updated when new pages or articles are added.</p><p>A sitemap alone does not guarantee indexing. Pages must be reachable through internal links, have clear title, description, and canonical URL, and not be blocked by <code>robots.txt</code>. After publishing, I check the file in Google Search Console and monitor indexing errors.</p><h3>5. Improve technical SEO and content structure</h3><p>The article uses one main heading followed by subheadings that describe a problem, solution, and result. This helps users and search engines. Keywords should occur naturally in the title, description, subheadings, and image alt text rather than through artificial repetition.</p><p>Terms describing this study include <strong>website speed optimization, web performance, Core Web Vitals, LCP optimization, CLS reduction, INP improvement, technical SEO, Astro Performance, Astro Sitemap, image compression, Google Lighthouse, and PageSpeed Insights</strong>.</p><h3>6. Post-deployment verification plan</h3><ol><li>Run a production build instead of measuring development.</li><li>Inspect file sizes and render-blocking resources.</li><li>Run Lighthouse on desktop and mobile.</li><li>Test on a slow network and a small screen.</li><li>Verify <code>sitemap-index.xml</code>, <code>robots.txt</code>, and core links.</li><li>Monitor Search Console and real-user data once enough traffic arrives.</li></ol><p>This cycle prevents improving one metric at the expense of another: deferring an important image can reduce page size but hurt LCP, while aggressively reducing JavaScript can break interaction or accessibility.</p><h2>7. Examine the page-load journey</h2><p>The page begins before the user sees its first character. The browser resolves the domain, creates a connection, sends a request, waits for the first byte, then parses HTML and discovers CSS, images, fonts, and scripts.</p><p>Any resource in this chain can become a bottleneck. I do not treat LCP as only an image problem; I trace it to DNS, TTFB, render-blocking CSS, or JavaScript delaying resource discovery.</p><p>Good diagnosis asks: when could the browser first have known about the resource, and what prevented it from using it?</p><h2>8. Font strategy</h2><p>Custom fonts improve visual identity but can cause <code>FOIT</code> or <code>FOUT</code> when managed poorly.</p><p>I use limited weights, avoid loading weights that do not appear, and set <code>font-display: swap</code> when showing text matters more than immediate visual matching.</p><p>With Google Fonts, review the effect of external DNS and TLS requests. On critical pages, host files locally and select a language subset instead of loading the entire Unicode set.</p><h2>9. Render-blocking CSS</h2><p>Large or unnecessary CSS can delay the first paint. Separate critical styles from styles the first viewport does not need.</p><p>This does not mean splitting files randomly. Measure CSS size and identify duplicate rules or rules from a library the page does not use.</p><p>Astro keeps HTML static, but CSS import style and component count still affect the final output.</p><h2>10. JavaScript on the first page</h2><p>Every script adds download, parse, and execution cost. Some interactions, such as language switching or opening project details, are necessary; the entire portfolio does not need to become a client application.</p><p>Keep important content in HTML and add interaction progressively. This improves SEO and keeps the page useful before JavaScript finishes.</p><p>Also avoid many listeners on similar elements when event delegation is possible, while preserving readability and keyboard behavior.</p><h2>11. Measurable image optimization</h2><p>Start by finding the actual display dimensions for each image. A 38×38 avatar does not need a 1440×1440 file.</p><p>Then choose a format for the content:</p><ul><li>WebP suits most images with good compression.</li><li>AVIF may be smaller, but support and decode speed must be tested.</li><li>PNG suits graphics needing transparency or precise edges.</li><li>SVG suits simple icons, with attention to source and trust.</li></ul><p>Do not use <code>loading="lazy"</code> for the image representing LCP. Images far below the viewport usually benefit from lazy loading.</p><h2>12. Prevent Cumulative Layout Shift</h2><p>CLS occurs when an element moves after the user sees it. Common causes are an image without dimensions, an ad without reserved space, or a font that changes text size.</p><p>Declaring <code>width</code>, <code>height</code>, or <code>aspect-ratio</code> gives the browser space before the resource arrives.</p><p>Do not add a notification bar after loading without reserving space, and do not let late fonts change button height.</p><h2>13. Improve INP and interaction</h2><p>INP measures page response to user interaction. A page that appears quickly is not enough if the language button or article window does not respond.</p><p>Long JavaScript tasks prevent screen updates. Split work, defer what is unnecessary, and reduce large DOM operations.</p><p>In the article interface, opening the window should be quick and code should not rebuild unrelated areas.</p><h2>14. Reduce TTFB and cache</h2><p>TTFB depends on server location, caching, page generation time, and third-party requests. Astro static pages reduce request-time generation, but CDN, Cache-Control, and deployment region still matter.</p><pre><code>Cache-Control: public, max-age=31536000, immutable</code></pre><p>Hashed assets can be cached for a long time. HTML and the sitemap need a shorter policy so updates arrive. Verify that cache does not serve an old <code>robots.txt</code> or sitemap.</p><h2>15. Performance budget</h2><p>Set a reviewable budget rather than saying “the site is fast”:</p><table><thead><tr><th>Resource</th><th>Suggested limit</th></tr></thead><tbody><tr><td>Minified JavaScript</td><td>Under 150 KB</td></tr><tr><td>Minified CSS</td><td>Under 80 KB</td></tr><tr><td>Hero image</td><td>Under 120 KB</td></tr><tr><td>Initial requests</td><td>Under 30</td></tr><tr><td>LCP on 4G</td><td>Under 2.5 seconds</td></tr><tr><td>CLS</td><td>Under 0.1</td></tr></tbody></table><p>These are not universal laws, but they make regressions detectable in a Pull Request.</p><h2>16. Lighthouse versus PageSpeed Insights</h2><p>Lighthouse runs in repeatable lab conditions and is excellent for before-and-after comparisons.</p><p>PageSpeed Insights shows CrUX data when available, which is closer to real users on different devices and networks.</p><p>Do not interpret one result without context. Repeat the measurement, compare the median, and review mobile versus desktop distribution.</p><h2>17. Test on a real phone</h2><p>An emulator does not always represent an old phone with limited memory. Test on a real device, use a slow network or throttling, and watch text appearance and button response.</p><p>Manual testing finds problems numbers miss: a wrapped heading, a table leaving the screen, or a close button overlapping a window edge.</p><h2>18. Technical SEO and content structure</h2><p>Every page needs a clear title and a description that explains its value, not a keyword list. The title names the main subject, the description summarizes the result, and subheadings answer real questions.</p><p>Repeating the same phrase dozens of times can hurt quality. Related terms such as website speed, web performance, Core Web Vitals, and technical SEO should appear in useful context.</p><p>A sitemap helps a search engine discover titles, while internal links explain their relationship. Performance, OTA, and Ring Buffer articles therefore connect through clear context rather than generic links.</p><h2>19. Accessibility is part of performance</h2><p>A fast page that cannot be used with a keyboard is not a complete product.</p><p>Check tab order, visible focus, button text, contrast, and appropriate <code>lang</code> and <code>dir</code> values for the article.</p><p>Fixed image dimensions reduce CLS, while hierarchical headings and clear labels help screen-reader navigation. Accessibility and performance metrics intersect more than they appear to.</p><h2>20. Monitoring and regression prevention</h2><p>After a good release, a new image or library can degrade performance. Review the build report and file sizes, and rerun Lighthouse when core components change.</p><p>Keep measurement results dated so you know whether an improvement is lasting. Also monitor sitemap, robots.txt, and Search Console indexing.</p><h2>21. Common optimization mistakes</h2><ul><li>Compressing every image without considering text inside it.</li><li>Lazy-loading the LCP image.</li><li>Removing necessary JavaScript and adding it back in a larger form.</li><li>Relying on Lighthouse once.</li><li>Adding keywords unrelated to the text.</li><li>Creating a sitemap without setting the base <code>site</code>.</li><li>Forgetting to test the page right-to-left.</li></ul><h2>22. Pre-deployment checklist</h2><ol><li>Does the production build pass?</li><li>Are unique title and description visible?</li><li>Does every image have dimensions and suitable alt text?</li><li>Is mobile LCP below target?</li><li>Is CLS stable while fonts and images load?</li><li>Do language and window buttons work with the keyboard?</li><li>Are internal article links correct?</li><li>Are sitemap and robots.txt available?</li><li>Are there unnecessary external resources?</li><li>Was the article page tested on a small screen?</li></ol><h2>Results and achieved numbers</h2><table><thead><tr><th>Metric</th><th>Desktop</th><th>Mobile</th></tr></thead><tbody><tr><td>Performance</td><td>100 / 100</td><td>90+ / 100</td></tr><tr><td>Best Practices</td><td>100 / 100</td><td>100 / 100</td></tr><tr><td>SEO</td><td>100 / 100</td><td>100 / 100</td></tr><tr><td>Accessibility</td><td>96 / 100</td><td>96 / 100</td></tr><tr><td>Server response time</td><td>0.8 seconds</td><td>Fast and stable</td></tr></tbody></table><h2>What can improve later?</h2><p>The current results are a strong point, but they are not the end. Next steps include collecting real visitor data, improving remaining images, reviewing font sizes, and adding automated tests that prevent large images or broken links from returning. A more precise cache policy for static assets and article-page performance monitoring can follow as the collection grows.</p><h2>Conclusion</h2><p>Performance is not cosmetic; it is part of product quality. Reducing asset size, tuning JavaScript, improving Core Web Vitals, writing accessible HTML, and providing a correct sitemap are connected decisions that improve speed and discoverability together. The best result comes from continuous measurement and small decisions whose impact can be proven with numbers.</p>`
    }
  }
};