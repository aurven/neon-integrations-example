// News Data API abstraction layer
    class NewsDataService {
      constructor() {
        // Mock data for testing
        this.mockData = [
          {
            id: 1,
            type: "article",
            title: "Global Climate Summit Announces New Emissions Targets",
            date: "2025-03-29T14:23:00",
            source: "Reuters",
            author: "Jane Smith",
            image: "https://picsum.photos/id/1/600/300",
            description: "Leaders from 195 countries have agreed to more ambitious carbon emission reduction targets during the latest global climate summit.",
            content: "GENEVA - In a landmark decision reached early Thursday morning, representatives from 195 countries have committed to significantly reducing carbon emissions over the next decade. The agreement, which comes after two weeks of intense negotiations, establishes a framework for nations to revise their climate action plans every two years rather than every five years as previously required.\n\n\"This is a crucial step forward in our fight against climate change,\" said UN Secretary-General António Guterres. \"The science is clear: we must act now and decisively to prevent catastrophic warming.\"\n\nDeveloped nations have also pledged to increase climate financing to developing countries to $100 billion annually, helping them transition to renewable energy sources and adapt to climate impacts already underway.",
            categories: ["politics", "science"]
          },
          {
            id: 2,
            type: "image",
            title: "Rare Supercell Storm Formation Captured in High Resolution",
            date: "2025-03-30T09:45:00",
            source: "National Geographic",
            photographer: "Michael Chen",
            image: "https://picsum.photos/id/1/800/600",
            location: "Oklahoma, USA",
            equipment: "Canon EOS R5, 24-70mm f/2.8 lens",
            description: "A stunning formation of a supercell thunderstorm was captured yesterday evening by our photographer in the Great Plains. The storm produced several tornadoes that fortunately did not impact populated areas.",
            categories: ["science"]
          },
          {
            id: 3,
            type: "article",
            title: "Researchers Discover Potential Breakthrough in Alzheimer's Treatment",
            date: "2025-03-30T16:12:00",
            source: "Science Daily",
            author: "Robert Johnson",
            image: "https://picsum.photos/id/1/600/300",
            description: "A team of neuroscientists has identified a novel protein that appears to reverse cognitive decline in early-stage Alzheimer's patients during preliminary clinical trials.",
            content: "BOSTON - Scientists at the Neurodegenerative Disease Research Institute have published promising results from Phase II clinical trials of a new Alzheimer's treatment. The drug, code-named NDX-1042, targets a specific protein pathway involved in neuronal communication and appears to not only slow cognitive decline but potentially reverse some symptoms in early-stage patients.\n\n\"These results are encouraging, but we must be cautious about over-interpretation,\" said lead researcher Dr. Elena Rodriguez. \"We're seeing cognitive improvements that exceed anything available with current treatments, but larger studies are needed to confirm these findings.\"\n\nThe treatment works differently from previous approaches that focused primarily on amyloid plaque reduction. Instead, NDX-1042 appears to improve neuronal resilience and cognitive function regardless of plaque buildup. Phase III trials involving 2,000 patients across 50 medical centers are scheduled to begin next month.",
            categories: ["health", "science"]
          },
          {
            id: 4,
            type: "video",
            title: "SpaceX Launches Largest Commercial Satellite Constellation",
            date: "2025-03-31T10:05:00",
            source: "Space News Network",
            videographer: "Thomas Wright",
            video: "https://file-examples.com/storage/fef84aaf2b67ec4bd96eb90/2017/04/file_example_MP4_480_1_5MG.mp4",
            duration: "4:32",
            location: "Cape Canaveral, Florida",
            resolution: "4K (3840×2160)",
            description: "Footage of yesterday's Falcon Heavy rocket launch delivering 60 satellites to low Earth orbit, expanding the global communications network.",
            categories: ["science", "technology"]
          },
          {
            id: 5,
            type: "article",
            title: "Global Stock Markets Rally as Inflation Data Shows Cooling Trend",
            date: "2025-04-01T08:30:00",
            source: "Financial Times",
            author: "Elizabeth Warren",
            image: "https://picsum.photos/id/1/600/300",
            description: "Stock indices worldwide surged after new economic data indicated inflation rates are decreasing faster than anticipated, raising hopes for potential interest rate cuts.",
            content: "NEW YORK - Global markets responded enthusiastically Tuesday as inflation figures from major economies came in below analyst expectations. The S&P 500 jumped 2.3% while European and Asian markets saw similar gains after the U.S. Consumer Price Index showed a 2.1% annual increase, down from 2.6% in the previous month.\n\n\"This data suggests the restrictive monetary policy implemented over the past two years is finally achieving its desired effect,\" said Morgan Stanley chief economist Patricia Chen. \"We're seeing meaningful disinflation without the severe recession many had feared.\"\n\nThe positive inflation news has investors anticipating that central banks may begin easing interest rates sooner than previously expected. Bond yields fell sharply on the news, with the 10-year Treasury yield dropping 15 basis points to 3.65%.",
            categories: ["business"]
          },
          {
            id: 6,
            type: "audio",
            title: "Interview with Nobel Prize-Winning Economist on Post-Pandemic Recovery",
            date: "2025-03-29T11:15:00",
            source: "Economic Insights Podcast",
            host: "David Chang",
            guest: "Dr. Amartya Singh",
            audio: "https://file-examples.com/storage/fef84aaf2b67ec4bd96eb90/2017/11/file_example_MP3_700KB.mp3",
            duration: "28:45",
            format: "MP3, 320kbps",
            description: "An in-depth conversation with Dr. Singh about global economic inequality, recovery strategies, and sustainable development in the wake of recent global crises.",
            transcript: "Available upon request",
            categories: ["business", "politics"]
          },
          {
            id: 7,
            type: "image",
            title: "Rare Leopard Species Photographed for First Time in 50 Years",
            date: "2025-03-28T14:20:00",
            source: "Wildlife Conservation Society",
            photographer: "Isabella Rodriguez",
            image: "https://picsum.photos/id/1/800/600",
            location: "Himalayan Mountains, Nepal",
            equipment: "Sony Alpha a9 III with 600mm telephoto lens",
            description: "A snow leopard subspecies thought to be nearly extinct has been documented by wildlife photographers using remote camera traps in a previously unexplored mountain range.",
            categories: ["science"]
          },
          {
            id: 8,
            type: "video",
            title: "Behind the Scenes of the Year's Most Anticipated Film",
            date: "2025-03-27T16:45:00",
            source: "Entertainment Weekly",
            videographer: "Sarah Johnson",
            video: "https://file-examples.com/storage/fef84aaf2b67ec4bd96eb90/2017/04/file_example_MP4_480_1_5MG.mp4",
            duration: "12:18",
            location: "Pinewood Studios, UK",
            resolution: "4K HDR",
            description: "Exclusive access to the set of 'Horizons Beyond', showing the practical and digital effects used to create the film's most spectacular sequences.",
            categories: ["entertainment"]
          },
          {
            id: 9,
            type: "audio",
            title: "New Symphony Merges Classical and Electronic Music Traditions",
            date: "2025-03-26T09:10:00",
            source: "Classical Music Today",
            composer: "Maya Yoshida",
            performers: "London Philharmonic Orchestra",
            audio: "https://file-examples.com/storage/fef84aaf2b67ec4bd96eb90/2017/11/file_example_MP3_700KB.mp3",
            duration: "42:16",
            format: "FLAC, 24-bit/96kHz",
            description: "World premiere recording of 'Digital Harmonies', a groundbreaking composition that integrates traditional orchestral instruments with synthesizers and electronic processing.",
            categories: ["entertainment"]
          },
          {
            id: 10,
            type: "article",
            title: "Major Sports League Announces AI-Powered Referee System",
            date: "2025-03-25T15:35:00",
            source: "Sports Illustrated",
            author: "Marcus Johnson",
            image: "https://picsum.photos/id/1/600/300",
            description: "The basketball league will implement advanced computer vision and AI decision-making to assist human referees in making accurate calls in real-time.",
            content: "NEW YORK - In a move that could revolutionize sports officiating, the Professional Basketball Association announced today it will deploy an AI-assisted referee system for the upcoming season. The system uses 12 ultra-high-speed cameras positioned throughout the arena to track player movements and ball trajectory with millimeter precision.\n\n\"This technology isn't replacing our officials,\" said league commissioner Janet Williams. \"It's enhancing their capabilities and ensuring the most accurate calls possible in a game that's gotten faster and more athletic than ever before.\"\n\nThe system can detect infractions like traveling, shot-clock violations, and out-of-bounds plays automatically, sending immediate alerts to referees' smart watches. For more subjective calls like fouls, the system provides instant replay from optimal angles within seconds. Testing during preseason games showed a 37% reduction in contested calls.",
            categories: ["sports", "technology"]
          }
        ];
      }

      // Get all news items
      async getNews() {
        // In a real implementation, this would fetch from an API
        return new Promise(resolve => {
          setTimeout(() => {
            resolve([...this.mockData]);
          }, 300);
        });
      }

      // Get a single news item by ID
      async getNewsById(id) {
        // In a real implementation, this would fetch from an API
        return new Promise(resolve => {
          setTimeout(() => {
            const news = this.mockData.find(item => item.id === id);
            resolve(news || null);
          }, 200);
        });
      }

      // Format date for display
      formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleString();
      }
      
      // Get icon class for media type
      getMediaTypeIcon(type) {
        switch(type) {
          case 'article':
            return '<i class="fas fa-newspaper article-icon"></i>';
          case 'image':
            return '<i class="fas fa-image image-icon"></i>';
          case 'audio':
            return '<i class="fas fa-headphones audio-icon"></i>';
          case 'video':
            return '<i class="fas fa-video video-icon"></i>';
          default:
            return '<i class="fas fa-file"></i>';
        }
      }
      
      // Format categories as colored chips
      formatCategories(categories) {
        if (!categories || categories.length === 0) return '';
        
        return categories.map(category => {
          return `<span class="category-chip category-${category}">${category.charAt(0).toUpperCase() + category.slice(1)}</span>`;
        }).join(' ');
      }
    }

    // News Table UI abstraction layer
    class NewsTableUI {
      constructor(elementId, dataService) {
        this.elementId = elementId;
        this.dataService = dataService;
        this.table = null;
        this.onViewCallback = null;
      }

      // Initialize the table
      initialize() {
        this.table = new Tabulator(`#${this.elementId}`, {
          height: 500,
          layout: "fitColumn",
          responsiveLayout:false,
          columns: [
            { 
              title: "Type", 
              field: "type", 
              width: "5px", 
              headerSort: true,
              formatter: (cell) => {
                return `<div class="media-icon">${this.dataService.getMediaTypeIcon(cell.getValue())}</div>`;
              }
            },
            { 
              title: "Title",
              field: "title",
              widthGrow: 2,
              headerSort: true,
              cellClick: (e, cell) => {
                const id = cell.getData().id;
                if (this.onViewCallback) {
                  this.onViewCallback(id);
                }
              }
            },
            {
              title: "Categories",
              field: "categories",
              widthGrow: 1,
              headerSort: false,
              formatter: (cell) => {
                return this.dataService.formatCategories(cell.getValue());
              }
            },
            { 
              title: "Date", 
              field: "date", 
              width: "15px", 
              headerSort: true,
              formatter: (cell) => {
                return this.dataService.formatDate(cell.getValue());
              },
              sorter: "datetime"
            },
            { 
              title: "Actions", 
              field: "id", 
              width: "5px", 
              headerSort: false,
              formatter: (cell) => {
                return `<button class="view-button">View</button>`;
              },
              cellClick: (e, cell) => {
                if (e.target.classList.contains('view-button')) {
                  const id = cell.getValue();
                  if (this.onViewCallback) {
                    this.onViewCallback(id);
                  }
                }
              }
            }
          ]
        });
      }

      // Set the callback function for when the view button is clicked
      onView(callback) {
        this.onViewCallback = callback;
      }

      // Load data into the table
      async loadData() {
        try {
          const data = await this.dataService.getNews();
          this.table.setData(data);
        } catch (error) {
          console.error("Error loading news data:", error);
        }
      }
    }

    // Modal UI abstraction
    class ModalUI {
      constructor(modalId, dataService) {
        this.modal = document.getElementById(modalId);
        this.modalBody = this.modal.querySelector('.modal-body');
        this.modalTitle = this.modal.querySelector('.modal-title');
        this.createStoryBtn = this.modal.querySelector('.create-story-btn');
        this.dataService = dataService;
        
        // Setup close buttons
        const closeButtons = this.modal.querySelectorAll('.modal-close, .modal-close-btn');
        closeButtons.forEach(btn => {
          btn.addEventListener('click', () => this.close());
        });
        
        // Close on backdrop click
        this.modal.addEventListener('click', (e) => {
          if (e.target === this.modal) {
            this.close();
          }
        });
      }
      
      // Generate content based on media type
      generateContent(item) {
        switch(item.type) {
          case 'article':
            return this.generateArticleContent(item);
          case 'image':
            return this.generateImageContent(item);
          case 'audio':
            return this.generateAudioContent(item);
          case 'video':
            return this.generateVideoContent(item);
          default:
            return '<p>Unsupported content type</p>';
        }
      }
      
      // Generate article content
      generateArticleContent(article) {
        this.modalTitle.textContent = 'Article Details';
        return `
          <img class="news-image" src="${article.image}" alt="${article.title}">
          <h2>${article.title}</h2>
          <div class="news-meta">
            <span>${this.dataService.formatDate(article.date)}</span> | 
            <span>Source: ${article.source}</span> | 
            <span>By: ${article.author}</span> |
            ${this.dataService.formatCategories(article.categories)}
          </div>
          <div class="news-description">
            ${article.description}
          </div>
          <div class="news-content">
            ${article.content.split('\n\n').map(p => `<p>${p}</p>`).join('')}
          </div>
        `;
      }
      
      // Generate image content
      generateImageContent(image) {
        this.modalTitle.textContent = 'Image Details';
        return `
          <h2>${image.title}</h2>
          <div class="news-meta">
            ${this.dataService.formatCategories(image.categories)}
          </div>
          <img class="news-image" src="${image.image}" alt="${image.title}">
          <div class="news-description">
            ${image.description}
          </div>
          <table class="metadata-table">
            <tr>
              <th>Date</th>
              <td>${this.dataService.formatDate(image.date)}</td>
            </tr>
            <tr>
              <th>Source</th>
              <td>${image.source}</td>
            </tr>
            <tr>
              <th>Photographer</th>
              <td>${image.photographer}</td>
            </tr>
            <tr>
              <th>Location</th>
              <td>${image.location}</td>
            </tr>
            <tr>
              <th>Equipment</th>
              <td>${image.equipment}</td>
            </tr>
          </table>
        `;
      }
      
      // Generate audio content
      generateAudioContent(audio) {
        this.modalTitle.textContent = 'Audio Details';
        return `
          <h2>${audio.title}</h2>
          <div class="news-meta">
            ${this.dataService.formatCategories(audio.categories)}
          </div>
          <audio class="audio-player" controls>
            <source src="${audio.audio}" type="audio/mpeg">
            Your browser does not support the audio element.
          </audio>
          <div class="news-description">
            ${audio.description}
          </div>
          <table class="metadata-table">
            <tr>
              <th>Date</th>
              <td>${this.dataService.formatDate(audio.date)}</td>
            </tr>
            <tr>
              <th>Source</th>
              <td>${audio.source}</td>
            </tr>
            <tr>
              <th>Host</th>
              <td>${audio.host || 'N/A'}</td>
            </tr>
            <tr>
              <th>Guest/Performer</th>
              <td>${audio.guest || audio.performers || audio.composer || 'N/A'}</td>
            </tr>
            <tr>
              <th>Duration</th>
              <td>${audio.duration}</td>
            </tr>
            <tr>
              <th>Format</th>
              <td>${audio.format}</td>
            </tr>
            <tr>
              <th>Transcript</th>
              <td>${audio.transcript || 'Not available'}</td>
            </tr>
          </table>
        `;
      }
      
      // Generate video content
      generateVideoContent(video) {
        this.modalTitle.textContent = 'Video Details';
        return `
          <h2>${video.title}</h2>
          <div class="news-meta">
            ${this.dataService.formatCategories(video.categories)}
          </div>
          <video class="video-player" controls poster="${video.video}">
            <source src="${video.video}" type="video/mp4">
            Your browser does not support the video element.
          </video>
          <div class="news-description">
            ${video.description}
          </div>
          <table class="metadata-table">
            <tr>
              <th>Date</th>
              <td>${this.dataService.formatDate(video.date)}</td>
            </tr>
            <tr>
              <th>Source</th>
              <td>${video.source}</td>
            </tr>
            <tr>
              <th>Videographer</th>
              <td>${video.videographer}</td>
            </tr>
            <tr>
              <th>Location</th>
              <td>${video.location}</td>
            </tr>
            <tr>
              <th>Duration</th>
              <td>${video.duration}</td>
            </tr>
            <tr>
              <th>Resolution</th>
              <td>${video.resolution}</td>
            </tr>
          </table>
        `;
      }
      
      // Open the modal with content
      async open(item) {
        try {
          if (item) {
            const content = this.generateContent(item);
            this.modalBody.innerHTML = content;
            this.modal.classList.add('active');
          }
        } catch (error) {
          console.error("Error loading content details:", error);
        }
      }
      
      // Close the modal
      close() {
        this.modal.classList.remove('active');
      }
      
      // Set callback for "Create Story" button
      onCreateStory(callback) {
        this.createStoryBtn.addEventListener('click', callback);
      }
    }

    // Main App
    document.addEventListener("DOMContentLoaded", function() {
      // Initialize services
      const newsService = new NewsDataService();
      const newsTable = new NewsTableUI("news-table", newsService);
      const modal = new ModalUI("news-modal", newsService);
      
      // Initialize the news table
      newsTable.initialize();
      
      // Load initial data
      newsTable.loadData();
      
      // Setup refresh button
      document.getElementById('refresh-btn').addEventListener('click', () => {
        newsTable.loadData();
      });
      
      // Setup modal view callback
      newsTable.onView(async (newsId) => {
        try {
          const news = await newsService.getNewsById(newsId);
          if (news) {
            modal.open(news);
          }
        } catch (error) {
          console.error("Error loading news details:", error);
        }
      });
      
      // Setup create story callback
      modal.onCreateStory(() => {
        alert("Create story functionality would be implemented here");
        modal.close();
      });
    });